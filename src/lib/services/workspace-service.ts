import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, MemberRole } from '../supabase/database.types';
import { runReviewPipeline } from '../engine/pipeline';
import { PUBLIC_SAMPLE_RULES } from '../constants/sample-rules';

export interface DraftVersionItem {
  id: string;
  draft_id: string;
  workspace_id: string;
  version_number: number;
  content: string;
  created_by: string;
  created_at: string;
}

export interface DraftDetail {
  id: string;
  workspace_id: string;
  title: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  versions: DraftVersionItem[];
  findings: any[];
  approvals: any[];
}

export class WorkspaceService {
  /**
   * In-memory cache for user and workspace session tokens
   */
  private tokenCache = new Map<string, string>();

  /**
   * Determines whether the environment is configured to use live Supabase
   */
  get isSupabase(): boolean {
    return Boolean(
      (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.USE_PGLITE !== 'true'
    );
  }

  /**
   * Lazily loads the local PGlite database only when running in offline/PGlite test mode
   */
  private async getLocalDb() {
    const { getLocalDatabase } = await import('../db/pglite-provider');
    return getLocalDatabase();
  }

  /**
   * Returns a configured Supabase client scoped to the provided JWT token or cached session
   */
  private getClient(token?: string, workspaceId?: string, userId?: string): SupabaseClient<Database> | null {
    if (!this.isSupabase) return null;

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    let effectiveToken = token;
    if (!effectiveToken && workspaceId) {
      effectiveToken = this.tokenCache.get(workspaceId);
    }
    if (!effectiveToken && userId) {
      effectiveToken = this.tokenCache.get(userId);
    }

    return createClient<Database>(url, key, {
      auth: { persistSession: false },
      global: effectiveToken ? { headers: { Authorization: `Bearer ${effectiveToken}` } } : undefined,
    });
  }

  /**
   * Initializes an isolated sandbox workspace for a judge session,
   * creates an anonymous Supabase user (or uses existing session), sets role to 'manager',
   * and leaves empty state pristine until optional sample data is loaded.
   */
  async initSandboxSession(existingUserId?: string, token?: string, existingWorkspaceId?: string) {
    if (this.isSupabase) {
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const anonClient = createClient<Database>(url, key, { auth: { persistSession: false } });

      let currentToken = token;
      let effectiveUserId = existingUserId;

      // If no valid token supplied, sign in anonymously to obtain a legitimate Supabase auth session
      if (!currentToken) {
        const { data: authData, error: authErr } = await anonClient.auth.signInAnonymously();
        if (authErr || !authData?.session) {
          throw new Error('Supabase anonymous sign-in failed: ' + (authErr?.message || 'No session'));
        }
        currentToken = authData.session.access_token;
        effectiveUserId = authData.user?.id || existingUserId || crypto.randomUUID();
      }

      const client = createClient<Database>(url, key, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${currentToken}` } },
      });

      // If an existing workspace ID was requested, verify if this user is a member
      if (existingWorkspaceId && effectiveUserId) {
        const { data: member } = await client
          .from('members')
          .select('role')
          .eq('workspace_id', existingWorkspaceId)
          .eq('user_id', effectiveUserId)
          .maybeSingle();

        if (member) {
          this.tokenCache.set(existingWorkspaceId, currentToken);
          this.tokenCache.set(effectiveUserId, currentToken);
          return {
            workspaceId: existingWorkspaceId,
            userId: effectiveUserId,
            role: member.role as MemberRole,
            token: currentToken,
          };
        }
      }

      // Create new sandbox workspace
      const workspaceId = crypto.randomUUID();
      const userId = effectiveUserId || crypto.randomUUID();

      const { error: wsErr } = await client.from('workspaces').insert({
        id: workspaceId,
        name: 'Judge Evaluation Sandbox',
      });
      if (wsErr) throw new Error('Failed to create workspace: ' + wsErr.message);

      const { error: memErr } = await client.from('members').insert({
        workspace_id: workspaceId,
        user_id: userId,
        role: 'manager',
      });
      if (memErr) throw new Error('Failed to register member: ' + memErr.message);

      // Cache token
      this.tokenCache.set(workspaceId, currentToken);
      this.tokenCache.set(userId, currentToken);

      return {
        workspaceId,
        userId,
        role: 'manager' as MemberRole,
        token: currentToken,
      };
    }

    // PGlite fallback for offline testing
    const db = await this.getLocalDb();
    const userId = existingUserId || crypto.randomUUID();
    const workspaceId = crypto.randomUUID();

    await db.query(
      `INSERT INTO public.workspaces (id, name) VALUES ($1, $2)`,
      [workspaceId, 'Judge Evaluation Sandbox']
    );

    await db.query(
      `INSERT INTO public.members (workspace_id, user_id, role) VALUES ($1, $2, $3)`,
      [workspaceId, userId, 'manager']
    );

    return {
      workspaceId,
      userId,
      role: 'manager' as MemberRole,
    };
  }

  /**
   * Toggles role inside the user's sandbox workspace
   */
  async switchRole(workspaceId: string, userId: string, role: MemberRole, token?: string) {
    const client = this.getClient(token, workspaceId, userId);
    if (client) {
      const { data, error } = await client
        .from('members')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .select('role')
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `UPDATE public.members SET role = $1, updated_at = now() WHERE workspace_id = $2 AND user_id = $3 RETURNING role`,
      [role, workspaceId, userId]
    );
    return res.rows[0];
  }

  /**
   * Retrieves active KB rules for a workspace
   */
  async getRules(workspaceId: string, token?: string) {
    const client = this.getClient(token, workspaceId);
    if (client) {
      const { data, error } = await client
        .from('kb_rules')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('rule_id', { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `SELECT * FROM public.kb_rules WHERE workspace_id = $1 ORDER BY rule_id ASC`,
      [workspaceId]
    );
    return res.rows;
  }

  /**
   * Upserts or versions a KB rule
   */
  async saveRule(
    workspaceId: string,
    rule: {
      rule_id: string;
      type: string;
      owner: string;
      effective_date: string;
      version: number;
      rule_text: string;
      source_name: string;
      source_url: string;
      status: string;
    },
    token?: string
  ) {
    const client = this.getClient(token, workspaceId);
    if (client) {
      const { data, error } = await client
        .from('kb_rules')
        .upsert(
          {
            workspace_id: workspaceId,
            rule_id: rule.rule_id,
            type: rule.type as any,
            owner: rule.owner,
            effective_date: rule.effective_date,
            version: rule.version,
            rule_text: rule.rule_text,
            source_name: rule.source_name,
            source_url: rule.source_url,
            origin: 'custom',
            status: rule.status as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,rule_id' }
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `
      INSERT INTO public.kb_rules (
        workspace_id, rule_id, type, owner, effective_date, version,
        rule_text, source_name, source_url, origin, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'custom', $10)
      ON CONFLICT (workspace_id, rule_id) DO UPDATE SET
        type = EXCLUDED.type,
        owner = EXCLUDED.owner,
        effective_date = EXCLUDED.effective_date,
        version = EXCLUDED.version,
        rule_text = EXCLUDED.rule_text,
        source_name = EXCLUDED.source_name,
        source_url = EXCLUDED.source_url,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *;
      `,
      [
        workspaceId,
        rule.rule_id,
        rule.type,
        rule.owner,
        rule.effective_date,
        rule.version,
        rule.rule_text,
        rule.source_name,
        rule.source_url,
        rule.status,
      ]
    );
    return res.rows[0];
  }

  /**
   * Retrieves historical version ledger for a rule
   */
  async getRuleHistory(workspaceId: string, ruleId: string, token?: string) {
    const client = this.getClient(token, workspaceId);
    if (client) {
      const { data, error } = await client
        .from('kb_rule_versions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('rule_id', ruleId)
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `SELECT * FROM public.kb_rule_versions WHERE workspace_id = $1 AND rule_id = $2 ORDER BY version DESC`,
      [workspaceId, ruleId]
    );
    return res.rows;
  }

  /**
   * Creates a new draft with version 1
   */
  async createDraft(workspaceId: string, userId: string, title: string, content: string, token?: string) {
    const client = this.getClient(token, workspaceId, userId);
    if (client) {
      const draftId = crypto.randomUUID();
      const versionId = crypto.randomUUID();

      const { error: draftErr } = await client.from('drafts').insert({
        id: draftId,
        workspace_id: workspaceId,
        title,
        status: 'DRAFT',
        created_by: userId,
      });
      if (draftErr) throw new Error(draftErr.message);

      const { error: verErr } = await client.from('draft_versions').insert({
        id: versionId,
        draft_id: draftId,
        workspace_id: workspaceId,
        version_number: 1,
        content,
        created_by: userId,
      });
      if (verErr) throw new Error(verErr.message);

      return this.getDraft(workspaceId, draftId, token);
    }

    const db = await this.getLocalDb();
    const draftId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    await db.query(
      `INSERT INTO public.drafts (id, workspace_id, title, status, created_by) VALUES ($1, $2, $3, 'DRAFT', $4)`,
      [draftId, workspaceId, title, userId]
    );

    await db.query(
      `INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by) VALUES ($1, $2, $3, 1, $4, $5)`,
      [versionId, draftId, workspaceId, content, userId]
    );

    return this.getDraft(workspaceId, draftId);
  }

  /**
   * Retrieves draft details including versions, findings, comments, and approvals
   */
  async getDraft(workspaceId: string, draftId: string, token?: string): Promise<DraftDetail | null> {
    const client = this.getClient(token, workspaceId);
    if (client) {
      const { data: draft, error: draftErr } = await client
        .from('drafts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', draftId)
        .maybeSingle();

      if (draftErr || !draft) return null;

      const { data: versions } = await client
        .from('draft_versions')
        .select('*')
        .eq('draft_id', draftId)
        .order('version_number', { ascending: true });

      const { data: findings } = await client
        .from('findings')
        .select('*')
        .eq('draft_id', draftId)
        .order('created_at', { ascending: true });

      const { data: approvals } = await client
        .from('approvals')
        .select('*')
        .eq('draft_id', draftId)
        .order('created_at', { ascending: false });

      return {
        ...draft,
        versions: (versions || []) as DraftVersionItem[],
        findings: findings || [],
        approvals: approvals || [],
      };
    }

    const db = await this.getLocalDb();

    const draftRes = await db.query(
      `SELECT * FROM public.drafts WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, draftId]
    );
    const draft = draftRes.rows[0] as any;
    if (!draft) return null;

    const versionsRes = await db.query(
      `SELECT * FROM public.draft_versions WHERE draft_id = $1 ORDER BY version_number ASC`,
      [draftId]
    );

    const findingsRes = await db.query(
      `SELECT * FROM public.findings WHERE draft_id = $1 ORDER BY created_at ASC`,
      [draftId]
    );

    const approvalsRes = await db.query(
      `SELECT * FROM public.approvals WHERE draft_id = $1 ORDER BY created_at DESC`,
      [draftId]
    );

    return {
      ...draft,
      versions: versionsRes.rows as DraftVersionItem[],
      findings: findingsRes.rows,
      approvals: approvalsRes.rows,
    };
  }

  /**
   * Lists drafts for a workspace
   */
  async listDrafts(workspaceId: string, token?: string) {
    const client = this.getClient(token, workspaceId);
    if (client) {
      const { data: drafts, error } = await client
        .from('drafts')
        .select('*, findings(id), draft_versions(version_number)')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false });

      if (error) throw new Error(error.message);

      return (drafts || []).map((d: any) => ({
        id: d.id,
        workspace_id: d.workspace_id,
        title: d.title,
        status: d.status,
        created_by: d.created_by,
        created_at: d.created_at,
        updated_at: d.updated_at,
        findings_count: d.findings?.length || 0,
        latest_version:
          d.draft_versions && d.draft_versions.length > 0
            ? Math.max(...d.draft_versions.map((v: any) => v.version_number || 1))
            : 1,
      }));
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `
      SELECT d.*, 
        (SELECT count(*) FROM public.findings f WHERE f.draft_id = d.id)::int as findings_count,
        (SELECT max(version_number) FROM public.draft_versions v WHERE v.draft_id = d.id)::int as latest_version
      FROM public.drafts d
      WHERE d.workspace_id = $1
      ORDER BY d.updated_at DESC
      `,
      [workspaceId]
    );
    return res.rows;
  }

  /**
   * Runs the full review engine on a draft
   */
  async reviewDraft(
    workspaceId: string,
    userId: string,
    draftId: string,
    options?: { codenames?: string[] },
    token?: string
  ) {
    const client = this.getClient(token, workspaceId, userId);
    const draft = await this.getDraft(workspaceId, draftId, token);
    if (!draft) throw new Error('Draft not found');

    const latestVersion = draft.versions[draft.versions.length - 1];
    if (!latestVersion) throw new Error('Draft has no content versions');

    const rules = (await this.getRules(workspaceId, token)) as any[];

    // Run review pipeline
    const pipelineResult = await runReviewPipeline({
      rawContent: latestVersion.content,
      workspaceId,
      activeRules: rules.map((r) => ({
        rule_id: r.rule_id,
        version: r.version,
        type: r.type,
        rule_text: r.rule_text,
      })),
      codenames: options?.codenames,
    });

    if (client) {
      // 1. Log outbound post-redaction payload to payload_log
      await client.from('payload_log').insert({
        workspace_id: workspaceId,
        user_id: userId,
        draft_id: draftId,
        endpoint: 'POST /api/drafts/[id]/review',
        payload: {
          redactedText: pipelineResult.redactedText,
          tokens: pipelineResult.tokens,
          rulesCount: rules.length,
          timestamp: new Date().toISOString(),
        } as any,
      });

      // 2. Clear previous findings for this draft before recording fresh review results
      await client.from('findings').delete().eq('draft_id', draftId);

      // 3. Insert findings
      for (const f of pipelineResult.findings) {
        await client.from('findings').insert({
          workspace_id: workspaceId,
          draft_id: draftId,
          draft_version_id: latestVersion.id,
          engine: f.engine,
          severity: f.severity,
          source_rule_id: f.source_rule_id,
          rule_version: f.rule_version,
          flagged_span: f.flagged_span,
          explanation: f.explanation,
          minimal_edit: f.minimal_edit,
          status: 'PENDING',
        });
      }

      // 4. Update draft status
      await client
        .from('drafts')
        .update({ status: 'IN_REVIEW', updated_at: new Date().toISOString() })
        .eq('id', draftId);

      return {
        draft: await this.getDraft(workspaceId, draftId, token),
        failedChecks: pipelineResult.failedChecks,
        emptyKb: pipelineResult.emptyKb,
        droppedLlmFindingsCount: pipelineResult.droppedLlmFindingsCount,
      };
    }

    const db = await this.getLocalDb();

    // Log outbound post-redaction payload to payload_log
    await db.query(
      `
      INSERT INTO public.payload_log (workspace_id, user_id, draft_id, endpoint, payload)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        workspaceId,
        userId,
        draftId,
        'POST /api/drafts/[id]/review',
        JSON.stringify({
          redactedText: pipelineResult.redactedText,
          tokens: pipelineResult.tokens,
          rulesCount: rules.length,
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    // Clear previous findings for this draft before recording fresh review results
    await db.query(`DELETE FROM public.findings WHERE draft_id = $1`, [draftId]);

    // Insert findings
    for (const f of pipelineResult.findings) {
      await db.query(
        `
        INSERT INTO public.findings (
          workspace_id, draft_id, draft_version_id, engine, severity,
          source_rule_id, rule_version, flagged_span, explanation, minimal_edit, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
        `,
        [
          workspaceId,
          draftId,
          latestVersion.id,
          f.engine,
          f.severity,
          f.source_rule_id,
          f.rule_version,
          f.flagged_span,
          f.explanation,
          f.minimal_edit,
        ]
      );
    }

    // Update draft status
    await db.query(`UPDATE public.drafts SET status = 'IN_REVIEW', updated_at = now() WHERE id = $1`, [
      draftId,
    ]);

    return {
      draft: await this.getDraft(workspaceId, draftId),
      failedChecks: pipelineResult.failedChecks,
      emptyKb: pipelineResult.emptyKb,
      droppedLlmFindingsCount: pipelineResult.droppedLlmFindingsCount,
    };
  }

  /**
   * Accepts a finding
   */
  async acceptFinding(findingId: string, token?: string) {
    const client = this.getClient(token);
    if (client) {
      const { data, error } = await client
        .from('findings')
        .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
        .eq('id', findingId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `UPDATE public.findings SET status = 'ACCEPTED', updated_at = now() WHERE id = $1 RETURNING *`,
      [findingId]
    );
    return res.rows[0];
  }

  /**
   * Overrides a finding with mandatory comment
   */
  async overrideFinding(findingId: string, comment: string, token?: string) {
    if (!comment || comment.trim().length === 0) {
      throw new Error('Override comment is required');
    }

    const client = this.getClient(token);
    if (client) {
      const { data, error } = await client
        .from('findings')
        .update({
          status: 'OVERRIDDEN',
          override_comment: comment.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', findingId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `UPDATE public.findings SET status = 'OVERRIDDEN', override_comment = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [comment.trim(), findingId]
    );
    return res.rows[0];
  }

  /**
   * Applies the minimal edit of a finding and creates a new incremental draft_version
   */
  async applyFix(workspaceId: string, userId: string, findingId: string, token?: string) {
    const client = this.getClient(token, workspaceId, userId);
    if (client) {
      const { data: finding, error: findErr } = await client
        .from('findings')
        .select('*')
        .eq('id', findingId)
        .single();
      if (findErr || !finding) throw new Error('Finding not found');
      if (!finding.minimal_edit) throw new Error('Finding has no minimal edit suggestion to apply');

      const draft = await this.getDraft(workspaceId, finding.draft_id, token);
      if (!draft) throw new Error('Draft not found');

      const latestVersion = draft.versions[draft.versions.length - 1];
      const newContent = latestVersion.content.replace(finding.flagged_span, finding.minimal_edit);
      const newVersionNumber = latestVersion.version_number + 1;
      const newVersionId = crypto.randomUUID();

      await client.from('draft_versions').insert({
        id: newVersionId,
        draft_id: draft.id,
        workspace_id: workspaceId,
        version_number: newVersionNumber,
        content: newContent,
        created_by: userId,
      });

      await client
        .from('findings')
        .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
        .eq('id', findingId);

      await client
        .from('drafts')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', draft.id);

      return this.getDraft(workspaceId, draft.id, token);
    }

    const db = await this.getLocalDb();

    const findingRes = await db.query(
      `SELECT * FROM public.findings WHERE id = $1`,
      [findingId]
    );
    const finding = findingRes.rows[0] as any;
    if (!finding) throw new Error('Finding not found');
    if (!finding.minimal_edit) throw new Error('Finding has no minimal edit suggestion to apply');

    const draft = await this.getDraft(workspaceId, finding.draft_id);
    if (!draft) throw new Error('Draft not found');

    const latestVersion = draft.versions[draft.versions.length - 1];
    const newContent = latestVersion.content.replace(finding.flagged_span, finding.minimal_edit);

    const newVersionNumber = latestVersion.version_number + 1;
    const newVersionId = crypto.randomUUID();

    // Create new draft version
    await db.query(
      `INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [newVersionId, draft.id, workspaceId, newVersionNumber, newContent, userId]
    );

    // Mark finding as accepted
    await db.query(
      `UPDATE public.findings SET status = 'ACCEPTED', updated_at = now() WHERE id = $1`,
      [findingId]
    );

    // Update draft timestamp
    await db.query(`UPDATE public.drafts SET updated_at = now() WHERE id = $1`, [draft.id]);

    return this.getDraft(workspaceId, draft.id);
  }

  /**
   * Manager approves or rejects a draft
   */
  async approveDraft(
    workspaceId: string,
    managerId: string,
    draftId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
    token?: string
  ) {
    const client = this.getClient(token, workspaceId, managerId);
    if (client) {
      const { data: member } = await client
        .from('members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', managerId)
        .single();

      if (!member || member.role !== 'manager') {
        throw new Error('Only managers can record approval decisions (enforced in DB)');
      }

      const draft = await this.getDraft(workspaceId, draftId, token);
      if (!draft) throw new Error('Draft not found');
      const latestVersion = draft.versions[draft.versions.length - 1];

      const { error: appErr } = await client.from('approvals').insert({
        workspace_id: workspaceId,
        draft_id: draftId,
        draft_version_id: latestVersion.id,
        reviewer_id: managerId,
        decision,
        comment: comment || null,
      });
      if (appErr) throw new Error(appErr.message);

      await client
        .from('drafts')
        .update({ status: decision, updated_at: new Date().toISOString() })
        .eq('id', draftId);

      return this.getDraft(workspaceId, draftId, token);
    }

    const db = await this.getLocalDb();

    // Verify manager role
    const memberRes = await db.query(
      `SELECT role FROM public.members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, managerId]
    );
    const member = memberRes.rows[0] as any;
    if (!member || member.role !== 'manager') {
      throw new Error('Only managers can record approval decisions (enforced in DB)');
    }

    const draft = await this.getDraft(workspaceId, draftId);
    if (!draft) throw new Error('Draft not found');
    const latestVersion = draft.versions[draft.versions.length - 1];

    // Insert approval record
    await db.query(
      `
      INSERT INTO public.approvals (workspace_id, draft_id, draft_version_id, reviewer_id, decision, comment)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [workspaceId, draftId, latestVersion.id, managerId, decision, comment || null]
    );

    // Update draft status
    await db.query(
      `UPDATE public.drafts SET status = $1, updated_at = now() WHERE id = $2`,
      [decision, draftId]
    );

    return this.getDraft(workspaceId, draftId);
  }

  /**
   * Retrieves outbound post-redaction payloads
   */
  async getPayloadLogs(workspaceId: string, token?: string) {
    const client = this.getClient(token, workspaceId);
    if (client) {
      const { data, error } = await client
        .from('payload_log')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    }

    const db = await this.getLocalDb();
    const res = await db.query(
      `SELECT * FROM public.payload_log WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );
    return res.rows;
  }

  /**
   * Loads an optional sample workspace with synthetic demonstration rules and drafts.
   * Labeled "Synthetic sample, not real company data".
   * Never loaded by default.
   */
  async loadSampleWorkspace(existingUserId?: string, token?: string) {
    const userId = existingUserId || crypto.randomUUID();
    const workspaceId = crypto.randomUUID();

    if (this.isSupabase) {
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const anonClient = createClient<Database>(url, key, { auth: { persistSession: false } });

      let currentToken = token;
      let effectiveUserId = existingUserId;

      if (!currentToken) {
        const { data: authData } = await anonClient.auth.signInAnonymously();
        currentToken = authData?.session?.access_token || token;
        effectiveUserId = authData?.user?.id || userId;
      }

      const client = createClient<Database>(url, key, {
        auth: { persistSession: false },
        global: currentToken ? { headers: { Authorization: `Bearer ${currentToken}` } } : undefined,
      });

      const actualUserId = effectiveUserId || userId;

      // 1. Workspace
      await client.from('workspaces').insert({
        id: workspaceId,
        name: 'Synthetic sample, not real company data',
      });

      // 2. Member
      await client.from('members').insert({
        workspace_id: workspaceId,
        user_id: actualUserId,
        role: 'manager',
      });

      // 3. Seed sample rules
      for (const r of PUBLIC_SAMPLE_RULES) {
        await client.from('kb_rules').upsert(
          {
            workspace_id: workspaceId,
            rule_id: r.rule_id,
            type: r.type as any,
            owner: r.owner,
            effective_date: r.effective_date,
            version: r.version,
            rule_text: r.rule_text,
            source_name: r.source_name,
            source_url: r.source_url,
            origin: r.origin as any,
            status: r.status as any,
          },
          { onConflict: 'workspace_id,rule_id' }
        );
      }

      // 4. Create Draft 1 (Deliberate violations)
      const d1Id = crypto.randomUUID();
      const v1Id = crypto.randomUUID();
      const d1Content =
        'Welcome to the Kestrel Cloud platform. We guarantee 99.99% zero-downtime uptime for all mission-critical enterprise workloads. If your team needs custom integration assistance, our engineers will slack you the deployment runbook directly. Happy Slacking!';
      await client.from('drafts').insert({
        id: d1Id,
        workspace_id: workspaceId,
        title: 'Product Launch Announcement (Synthetic)',
        status: 'DRAFT',
        created_by: actualUserId,
      });
      await client.from('draft_versions').insert({
        id: v1Id,
        draft_id: d1Id,
        workspace_id: workspaceId,
        version_number: 1,
        content: d1Content,
        created_by: actualUserId,
      });

      // 5. Create Draft 2 (Clean)
      const d2Id = crypto.randomUUID();
      const v2Id = crypto.randomUUID();
      const d2Content =
        'Our Cloud Orchestrator infrastructure guarantees a 99.9% uptime SLA under Section 4.1 of the Master Agreement. Team communication is coordinated via our enterprise messaging platform with verified accessibility benchmarks.';
      await client.from('drafts').insert({
        id: d2Id,
        workspace_id: workspaceId,
        title: 'Q3 System Maintenance & SLA Summary (Clean)',
        status: 'DRAFT',
        created_by: actualUserId,
      });
      await client.from('draft_versions').insert({
        id: v2Id,
        draft_id: d2Id,
        workspace_id: workspaceId,
        version_number: 1,
        content: d2Content,
        created_by: actualUserId,
      });

      if (currentToken) {
        this.tokenCache.set(workspaceId, currentToken);
        this.tokenCache.set(actualUserId, currentToken);
      }

      return {
        workspaceId,
        userId: actualUserId,
        role: 'manager' as MemberRole,
        isSample: true,
        token: currentToken,
      };
    }

    // PGlite fallback
    const db = await this.getLocalDb();
    await db.query(`INSERT INTO public.workspaces (id, name) VALUES ($1, $2)`, [
      workspaceId,
      'Synthetic sample, not real company data',
    ]);
    await db.query(`INSERT INTO public.members (workspace_id, user_id, role) VALUES ($1, $2, 'manager')`, [
      workspaceId,
      userId,
    ]);

    for (const r of PUBLIC_SAMPLE_RULES) {
      await db.query(
        `INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (workspace_id, rule_id) DO NOTHING`,
        [
          workspaceId,
          r.rule_id,
          r.type,
          r.owner,
          r.effective_date,
          r.version,
          r.rule_text,
          r.source_name,
          r.source_url,
          r.origin,
          r.status,
        ]
      );
    }

    const d1Id = crypto.randomUUID();
    const v1Id = crypto.randomUUID();
    const d1Content =
      'Welcome to the Kestrel Cloud platform. We guarantee 99.99% zero-downtime uptime for all mission-critical enterprise workloads. If your team needs custom integration assistance, our engineers will slack you the deployment runbook directly. Happy Slacking!';
    await db.query(
      `INSERT INTO public.drafts (id, workspace_id, title, status, created_by) VALUES ($1, $2, $3, 'DRAFT', $4)`,
      [d1Id, workspaceId, 'Product Launch Announcement (Synthetic)', userId]
    );
    await db.query(
      `INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by) VALUES ($1, $2, $3, 1, $4, $5)`,
      [v1Id, d1Id, workspaceId, d1Content, userId]
    );

    const d2Id = crypto.randomUUID();
    const v2Id = crypto.randomUUID();
    const d2Content =
      'Our Cloud Orchestrator infrastructure guarantees a 99.9% uptime SLA under Section 4.1 of the Master Agreement. Team communication is coordinated via our enterprise messaging platform with verified accessibility benchmarks.';
    await db.query(
      `INSERT INTO public.drafts (id, workspace_id, title, status, created_by) VALUES ($1, $2, $3, 'DRAFT', $4)`,
      [d2Id, workspaceId, 'Q3 System Maintenance & SLA Summary (Clean)', userId]
    );
    await db.query(
      `INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by) VALUES ($1, $2, $3, 1, $4, $5)`,
      [v2Id, d2Id, workspaceId, d2Content, userId]
    );

    return {
      workspaceId,
      userId,
      role: 'manager' as MemberRole,
      isSample: true,
    };
  }
}

export const workspaceService = new WorkspaceService();
