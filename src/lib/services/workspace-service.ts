import { getLocalDatabase } from '../db/pglite-provider';
import { runReviewPipeline } from '../engine/pipeline';
import type { MemberRole } from '../supabase/database.types';

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
   * Initializes an isolated sandbox workspace for a judge session,
   * seeds the 3 cited public sample rules, and sets role to 'manager'.
   */
  async initSandboxSession(existingUserId?: string) {
    const db = await getLocalDatabase();
    const userId = existingUserId || crypto.randomUUID();
    const workspaceId = crypto.randomUUID();

    // 1. Create sandbox workspace
    await db.query(
      `INSERT INTO public.workspaces (id, name) VALUES ($1, $2)`,
      [workspaceId, 'Judge Evaluation Sandbox']
    );

    // 2. Add user as manager
    await db.query(
      `INSERT INTO public.members (workspace_id, user_id, role) VALUES ($1, $2, $3)`,
      [workspaceId, userId, 'manager']
    );

    // 3. Clone the 3 approved public sample rules into this new sandbox workspace
    await db.query(
      `
      INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
      SELECT $1, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status
      FROM public.kb_rules
      WHERE origin = 'public_sample' AND workspace_id = '00000000-0000-0000-0000-000000000001'
      ON CONFLICT (workspace_id, rule_id) DO NOTHING;
      `,
      [workspaceId]
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
  async switchRole(workspaceId: string, userId: string, role: MemberRole) {
    const db = await getLocalDatabase();
    const res = await db.query(
      `UPDATE public.members SET role = $1, updated_at = now() WHERE workspace_id = $2 AND user_id = $3 RETURNING role`,
      [role, workspaceId, userId]
    );
    return res.rows[0];
  }

  /**
   * Retrieves active KB rules for a workspace
   */
  async getRules(workspaceId: string) {
    const db = await getLocalDatabase();
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
    }
  ) {
    const db = await getLocalDatabase();
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
  async getRuleHistory(workspaceId: string, ruleId: string) {
    const db = await getLocalDatabase();
    const res = await db.query(
      `SELECT * FROM public.kb_rule_versions WHERE workspace_id = $1 AND rule_id = $2 ORDER BY version DESC`,
      [workspaceId, ruleId]
    );
    return res.rows;
  }

  /**
   * Creates a new draft with version 1
   */
  async createDraft(workspaceId: string, userId: string, title: string, content: string) {
    const db = await getLocalDatabase();
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
  async getDraft(workspaceId: string, draftId: string): Promise<DraftDetail | null> {
    const db = await getLocalDatabase();

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
  async listDrafts(workspaceId: string) {
    const db = await getLocalDatabase();
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
    options?: { codenames?: string[] }
  ) {
    const db = await getLocalDatabase();
    const draft = await this.getDraft(workspaceId, draftId);
    if (!draft) throw new Error('Draft not found');

    const latestVersion = draft.versions[draft.versions.length - 1];
    if (!latestVersion) throw new Error('Draft has no content versions');

    const rules = (await this.getRules(workspaceId)) as any[];

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
    const newStatus = draft.status === 'NEEDS_RECHECK' ? 'IN_REVIEW' : 'IN_REVIEW';
    await db.query(`UPDATE public.drafts SET status = $1, updated_at = now() WHERE id = $2`, [
      newStatus,
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
  async acceptFinding(findingId: string) {
    const db = await getLocalDatabase();
    const res = await db.query(
      `UPDATE public.findings SET status = 'ACCEPTED', updated_at = now() WHERE id = $1 RETURNING *`,
      [findingId]
    );
    return res.rows[0];
  }

  /**
   * Overrides a finding with mandatory comment
   */
  async overrideFinding(findingId: string, comment: string) {
    if (!comment || comment.trim().length === 0) {
      throw new Error('Override comment is required');
    }
    const db = await getLocalDatabase();
    const res = await db.query(
      `UPDATE public.findings SET status = 'OVERRIDDEN', override_comment = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [comment.trim(), findingId]
    );
    return res.rows[0];
  }

  /**
   * Applies the minimal edit of a finding and creates a new incremental draft_version
   */
  async applyFix(workspaceId: string, userId: string, findingId: string) {
    const db = await getLocalDatabase();

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
    comment?: string
  ) {
    const db = await getLocalDatabase();

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
  async getPayloadLogs(workspaceId: string) {
    const db = await getLocalDatabase();
    const res = await db.query(
      `SELECT * FROM public.payload_log WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );
    return res.rows;
  }
}

export const workspaceService = new WorkspaceService();
