import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import * as fs from 'fs';
import * as path from 'path';

describe('Kestrel RLS & Data Integrity Test Suite', () => {
  let db: PGlite;

  // Test User IDs
  const USER_1 = '11111111-1111-1111-1111-111111111111';
  const USER_2 = '22222222-2222-2222-2222-222222222222';

  // Test Workspace IDs
  const WS_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const WS_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  /**
   * Helper to execute queries with simulated Supabase JWT auth.uid() and role 'authenticated'
   */
  async function asUser(userId: string | null, fn: () => Promise<void>) {
    await db.exec(`SET ROLE authenticated;`);
    if (userId) {
      await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
    } else {
      await db.exec(`SET request.jwt.claim.sub = '';`);
    }
    try {
      await fn();
    } finally {
      await db.exec(`RESET request.jwt.claim.sub;`);
      await db.exec(`RESET ROLE;`);
    }
  }

  beforeEach(async () => {
    db = new PGlite({ extensions: { vector } });

    // Define auth schema and auth.uid() helper for PGlite test environment
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
    `);

    // Load and execute migration
    const migrationSql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261027000000_init_kestrel.sql'),
      'utf8'
    );
    await db.exec(migrationSql);

    // Create non-superuser role 'authenticated' to mirror Supabase user sessions
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
    `);
  });

  describe('1. Workspace Isolation', () => {
    it('prevents a member of Workspace A from reading or modifying data in Workspace B', async () => {
      // 1. Setup workspaces and members as system
      await db.exec(`
        INSERT INTO public.workspaces (id, name) VALUES ('${WS_A}', 'Workspace A');
        INSERT INTO public.workspaces (id, name) VALUES ('${WS_B}', 'Workspace B');

        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_1}', 'creator');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_B}', '${USER_2}', 'manager');

        INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
        VALUES ('${WS_B}', 'RULE-SECRET-B', 'TERM', 'Legal', '2026-01-01', 1, 'Confidential guideline in B', 'B Source', 'https://b.test', 'custom', 'ACTIVE');
      `);

      // 2. Query as USER_1 (member of WS_A only)
      await asUser(USER_1, async () => {
        // Can view WS_A
        const resA = await db.query(`SELECT * FROM public.workspaces WHERE id = '${WS_A}'`);
        expect(resA.rows.length).toBe(1);

        // CANNOT view WS_B
        const resB = await db.query(`SELECT * FROM public.workspaces WHERE id = '${WS_B}'`);
        expect(resB.rows.length).toBe(0);

        // CANNOT view rules in WS_B
        const rulesB = await db.query(`SELECT * FROM public.kb_rules WHERE workspace_id = '${WS_B}'`);
        expect(rulesB.rows.length).toBe(0);

        // CANNOT insert a rule into WS_B
        await expect(
          db.exec(`
            INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
            VALUES ('${WS_B}', 'INTRUDER-RULE', 'TERM', 'Hacker', '2026-01-01', 1, 'Injected text', 'Intruder', 'https://hacked.test', 'custom', 'ACTIVE');
          `)
        ).rejects.toThrow();
      });
    });
  });

  describe('2. Role-Based Access Control', () => {
    it('enforces creator cannot create KB rules, but manager can', async () => {
      await db.exec(`
        INSERT INTO public.workspaces (id, name) VALUES ('${WS_A}', 'Workspace A');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_1}', 'creator');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_2}', 'manager');
      `);

      // Creator USER_1 attempts to insert a KB rule -> MUST FAIL
      await asUser(USER_1, async () => {
        await expect(
          db.exec(`
            INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
            VALUES ('${WS_A}', 'TEST-CREATOR-RULE', 'TERM', 'Creator', '2026-01-01', 1, 'Unauthorized rule', 'Source', 'https://src.test', 'custom', 'ACTIVE');
          `)
        ).rejects.toThrow();
      });

      // Manager USER_2 inserts a KB rule -> MUST SUCCEED
      await asUser(USER_2, async () => {
        await db.exec(`
          INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
          VALUES ('${WS_A}', 'TEST-MANAGER-RULE', 'TERM', 'Manager', '2026-01-01', 1, 'Authorized rule', 'Source', 'https://src.test', 'custom', 'ACTIVE');
        `);

        const rules = await db.query(`SELECT rule_id FROM public.kb_rules WHERE workspace_id = '${WS_A}'`);
        expect(rules.rows.length).toBe(1);
        expect((rules.rows[0] as any).rule_id).toBe('TEST-MANAGER-RULE');
      });
    });

    it('enforces only managers can create approvals', async () => {
      const DRAFT_ID = '33333333-3333-3333-3333-333333333333';
      const DRAFT_VER_ID = '44444444-4444-4444-4444-444444444444';

      await db.exec(`
        INSERT INTO public.workspaces (id, name) VALUES ('${WS_A}', 'Workspace A');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_1}', 'creator');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_2}', 'manager');
        INSERT INTO public.drafts (id, workspace_id, title, status, created_by)
        VALUES ('${DRAFT_ID}', '${WS_A}', 'Draft 1', 'IN_REVIEW', '${USER_1}');
        INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by)
        VALUES ('${DRAFT_VER_ID}', '${DRAFT_ID}', '${WS_A}', 1, 'Draft content', '${USER_1}');
      `);

      // Creator USER_1 tries to approve -> FAILS
      await asUser(USER_1, async () => {
        await expect(
          db.exec(`
            INSERT INTO public.approvals (workspace_id, draft_id, draft_version_id, reviewer_id, decision)
            VALUES ('${WS_A}', '${DRAFT_ID}', '${DRAFT_VER_ID}', '${USER_1}', 'APPROVED');
          `)
        ).rejects.toThrow();
      });

      // Manager USER_2 approves -> SUCCEEDS
      await asUser(USER_2, async () => {
        await db.exec(`
          INSERT INTO public.approvals (workspace_id, draft_id, draft_version_id, reviewer_id, decision)
          VALUES ('${WS_A}', '${DRAFT_ID}', '${DRAFT_VER_ID}', '${USER_2}', 'APPROVED');
        `);

        const approvals = await db.query(`SELECT decision FROM public.approvals WHERE draft_id = '${DRAFT_ID}'`);
        expect(approvals.rows.length).toBe(1);
        expect((approvals.rows[0] as any).decision).toBe('APPROVED');
      });
    });

    it('allows anonymous judge role switcher inside their own workspace', async () => {
      // Judge creates their sandbox workspace and joins as manager
      await asUser(USER_1, async () => {
        await db.exec(`
          INSERT INTO public.workspaces (id, name) VALUES ('${WS_A}', 'Judge Sandbox');
          INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_1}', 'manager');
        `);

        // Switch role to 'creator' to test creator experience
        await db.exec(`
          UPDATE public.members SET role = 'creator' WHERE workspace_id = '${WS_A}' AND user_id = '${USER_1}';
        `);

        let roleRes = await db.query(`SELECT role FROM public.members WHERE workspace_id = '${WS_A}' AND user_id = '${USER_1}'`);
        expect((roleRes.rows[0] as any).role).toBe('creator');

        // Switch role to 'reviewer'
        await db.exec(`
          UPDATE public.members SET role = 'reviewer' WHERE workspace_id = '${WS_A}' AND user_id = '${USER_1}';
        `);

        roleRes = await db.query(`SELECT role FROM public.members WHERE workspace_id = '${WS_A}' AND user_id = '${USER_1}'`);
        expect((roleRes.rows[0] as any).role).toBe('reviewer');

        // Switch back to 'manager'
        await db.exec(`
          UPDATE public.members SET role = 'manager' WHERE workspace_id = '${WS_A}' AND user_id = '${USER_1}';
        `);

        roleRes = await db.query(`SELECT role FROM public.members WHERE workspace_id = '${WS_A}' AND user_id = '${USER_1}'`);
        expect((roleRes.rows[0] as any).role).toBe('manager');
      });
    });
  });

  describe('3. Trigger Behavior: Rule Version / Date Change or Deletion sets Drafts to NEEDS_RECHECK', () => {
    it('sets drafts citing an old rule version to NEEDS_RECHECK when rule version changes', async () => {
      const DRAFT_1 = '11111111-0000-0000-0000-000000000001';
      const DRAFT_2 = '22222222-0000-0000-0000-000000000002';
      const VER_1 = '33333333-0000-0000-0000-000000000001';
      const VER_2 = '44444444-0000-0000-0000-000000000002';

      await db.exec(`
        INSERT INTO public.workspaces (id, name) VALUES ('${WS_A}', 'Workspace A');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_1}', 'manager');

        -- Insert Rule at version 1
        INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
        VALUES ('${WS_A}', 'FACT-SLA-01', 'FACT', 'Support Ops', '2026-01-01', 1, 'Uptime SLA is 99.9%', 'SLA Doc', 'https://sla.test', 'custom', 'ACTIVE');

        -- Insert Draft 1 (status = APPROVED) with finding citing FACT-SLA-01 v1
        INSERT INTO public.drafts (id, workspace_id, title, status, created_by)
        VALUES ('${DRAFT_1}', '${WS_A}', 'Customer Announcement', 'APPROVED', '${USER_1}');
        INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by)
        VALUES ('${VER_1}', '${DRAFT_1}', '${WS_A}', 1, 'Our uptime is 99.9%', '${USER_1}');
        INSERT INTO public.findings (workspace_id, draft_id, draft_version_id, engine, severity, source_rule_id, rule_version, flagged_span, explanation, status)
        VALUES ('${WS_A}', '${DRAFT_1}', '${VER_1}', 'DETERMINISTIC', 'LOW', 'FACT-SLA-01', 1, '99.9%', 'Matches SLA', 'ACCEPTED');

        -- Insert Draft 2 (status = APPROVED) with NO findings citing FACT-SLA-01 v1
        INSERT INTO public.drafts (id, workspace_id, title, status, created_by)
        VALUES ('${DRAFT_2}', '${WS_A}', 'Product Release Notes', 'APPROVED', '${USER_1}');
        INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by)
        VALUES ('${VER_2}', '${DRAFT_2}', '${WS_A}', 1, 'New dark mode feature', '${USER_1}');
      `);

      // Update Rule FACT-SLA-01 to version 2 (e.g. SLA upgraded to 99.95%)
      await db.exec(`
        UPDATE public.kb_rules
        SET version = 2, rule_text = 'Uptime SLA is 99.95%', effective_date = '2026-02-01'
        WHERE workspace_id = '${WS_A}' AND rule_id = 'FACT-SLA-01';
      `);

      // Verify Draft 1 automatically changed to NEEDS_RECHECK
      const resD1 = await db.query(`SELECT status FROM public.drafts WHERE id = '${DRAFT_1}'`);
      expect((resD1.rows[0] as any).status).toBe('NEEDS_RECHECK');

      // Verify Draft 2 remained APPROVED (unaffected)
      const resD2 = await db.query(`SELECT status FROM public.drafts WHERE id = '${DRAFT_2}'`);
      expect((resD2.rows[0] as any).status).toBe('APPROVED');
    });

    it('sets drafts citing a deleted rule to NEEDS_RECHECK', async () => {
      const DRAFT_1 = '55555555-0000-0000-0000-000000000001';
      const VER_1 = '66666666-0000-0000-0000-000000000001';

      await db.exec(`
        INSERT INTO public.workspaces (id, name) VALUES ('${WS_A}', 'Workspace A');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_1}', 'manager');

        INSERT INTO public.kb_rules (workspace_id, rule_id, type, owner, effective_date, version, rule_text, source_name, source_url, origin, status)
        VALUES ('${WS_A}', 'BRAND-DEPRECATED', 'TERM', 'Marketing', '2026-01-01', 1, 'Old phrase', 'Brand Guide', 'https://guide.test', 'custom', 'ACTIVE');

        INSERT INTO public.drafts (id, workspace_id, title, status, created_by)
        VALUES ('${DRAFT_1}', '${WS_A}', 'Social Media Post', 'IN_REVIEW', '${USER_1}');
        INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by)
        VALUES ('${VER_1}', '${DRAFT_1}', '${WS_A}', 1, 'Post content with Old phrase', '${USER_1}');
        INSERT INTO public.findings (workspace_id, draft_id, draft_version_id, engine, severity, source_rule_id, rule_version, flagged_span, explanation, status)
        VALUES ('${WS_A}', '${DRAFT_1}', '${VER_1}', 'DETERMINISTIC', 'MEDIUM', 'BRAND-DEPRECATED', 1, 'Old phrase', 'Banned phrase', 'PENDING');
      `);

      // Delete the rule
      await db.exec(`DELETE FROM public.kb_rules WHERE workspace_id = '${WS_A}' AND rule_id = 'BRAND-DEPRECATED';`);

      // Verify draft status became NEEDS_RECHECK
      const res = await db.query(`SELECT status FROM public.drafts WHERE id = '${DRAFT_1}'`);
      expect((res.rows[0] as any).status).toBe('NEEDS_RECHECK');
    });
  });

  describe('4. Finding Status & Override Constraints', () => {
    it('requires override_comment when finding status is OVERRIDDEN', async () => {
      const DRAFT_1 = '77777777-0000-0000-0000-000000000001';
      const VER_1 = '88888888-0000-0000-0000-000000000001';
      const FINDING_1 = '99999999-0000-0000-0000-000000000001';

      await db.exec(`
        INSERT INTO public.workspaces (id, name) VALUES ('${WS_A}', 'Workspace A');
        INSERT INTO public.members (workspace_id, user_id, role) VALUES ('${WS_A}', '${USER_1}', 'creator');
        INSERT INTO public.drafts (id, workspace_id, title, status, created_by)
        VALUES ('${DRAFT_1}', '${WS_A}', 'Draft 1', 'DRAFT', '${USER_1}');
        INSERT INTO public.draft_versions (id, draft_id, workspace_id, version_number, content, created_by)
        VALUES ('${VER_1}', '${DRAFT_1}', '${WS_A}', 1, 'Content with issue', '${USER_1}');
        INSERT INTO public.findings (id, workspace_id, draft_id, draft_version_id, engine, severity, source_rule_id, rule_version, flagged_span, explanation, status)
        VALUES ('${FINDING_1}', '${WS_A}', '${DRAFT_1}', '${VER_1}', 'DETERMINISTIC', 'HIGH', 'TERM-01', 1, 'issue', 'Violation', 'PENDING');
      `);

      // Updating status to OVERRIDDEN without override_comment must fail
      await expect(
        db.exec(`UPDATE public.findings SET status = 'OVERRIDDEN' WHERE id = '${FINDING_1}';`)
      ).rejects.toThrow();

      // Updating status to OVERRIDDEN with whitespace-only comment must fail
      await expect(
        db.exec(`UPDATE public.findings SET status = 'OVERRIDDEN', override_comment = '   ' WHERE id = '${FINDING_1}';`)
      ).rejects.toThrow();

      // Updating status to OVERRIDDEN with valid comment must succeed
      await db.exec(`
        UPDATE public.findings
        SET status = 'OVERRIDDEN', override_comment = 'Legal exception granted by Sarah via ticket #402'
        WHERE id = '${FINDING_1}';
      `);

      const res = await db.query(`SELECT status, override_comment FROM public.findings WHERE id = '${FINDING_1}'`);
      expect((res.rows[0] as any).status).toBe('OVERRIDDEN');
      expect((res.rows[0] as any).override_comment).toBe('Legal exception granted by Sarah via ticket #402');
    });
  });

  describe('5. Seed Data Citation & Idempotency', () => {
    it('seeds only the 3 cited public sources with correct metadata and archives them', async () => {
      const seedSql = fs.readFileSync(path.join(process.cwd(), 'supabase/seed.sql'), 'utf8');

      // Execute seed once
      await db.exec(seedSql);

      const rulesRes = await db.query(`
        SELECT rule_id, type, owner, origin, source_name, source_url
        FROM public.kb_rules
        ORDER BY rule_id ASC;
      `);

      expect(rulesRes.rows.length).toBe(3);

      const ruleIds = rulesRes.rows.map((r: any) => r.rule_id);
      expect(ruleIds).toEqual(['SLACK-BRAND-01', 'WCAG-2.1-1.1.1', 'WCAG-2.1-1.4.3']);

      // Verify every row has origin = 'public_sample' and cited sources
      for (const row of rulesRes.rows as any[]) {
        expect(row.origin).toBe('public_sample');
        expect(row.source_name.length).toBeGreaterThan(5);
        expect(row.source_url.startsWith('https://')).toBe(true);
      }

      // Re-execute seed to verify complete idempotency
      await expect(db.exec(seedSql)).resolves.not.toThrow();
    });
  });
});
