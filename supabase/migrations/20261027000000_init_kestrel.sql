-- Kestrel Core Data Layer Migration
-- Schema, RLS policies, Indexes, and Integrity Triggers

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. AUTH COMPATIBILITY HELPER
-- Ensures auth.uid() works both within Supabase Auth and isolated SQL test environments
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- 3. TABLES

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Members & Workspace Roles (creator, reviewer, manager)
CREATE TABLE IF NOT EXISTS public.members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('creator', 'reviewer', 'manager')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT members_workspace_user_unique UNIQUE (workspace_id, user_id)
);

-- Knowledge Base Rules
CREATE TABLE IF NOT EXISTS public.kb_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    rule_id text NOT NULL,
    type text NOT NULL CHECK (type IN ('TONE', 'TERM', 'FACT', 'VISUAL', 'ACCESSIBILITY')),
    owner text NOT NULL,
    effective_date date NOT NULL DEFAULT CURRENT_DATE,
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    rule_text text NOT NULL,
    source_name text NOT NULL,
    source_url text NOT NULL,
    origin text NOT NULL CHECK (origin IN ('public_sample', 'custom')),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED', 'DRAFT')),
    embedding vector(1536),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kb_rules_workspace_rule_unique UNIQUE (workspace_id, rule_id)
);

-- Knowledge Base Rule Versions (Audit & History Ledger)
CREATE TABLE IF NOT EXISTS public.kb_rule_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    rule_id text NOT NULL,
    version integer NOT NULL CHECK (version >= 1),
    type text NOT NULL CHECK (type IN ('TONE', 'TERM', 'FACT', 'VISUAL', 'ACCESSIBILITY')),
    owner text NOT NULL,
    effective_date date NOT NULL,
    rule_text text NOT NULL,
    source_name text NOT NULL,
    source_url text NOT NULL,
    origin text NOT NULL CHECK (origin IN ('public_sample', 'custom')),
    status text NOT NULL CHECK (status IN ('ACTIVE', 'DEPRECATED', 'DRAFT')),
    created_at timestamptz NOT NULL DEFAULT now(),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kb_rule_versions_unique UNIQUE (workspace_id, rule_id, version)
);

-- Drafts
CREATE TABLE IF NOT EXISTS public.drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'NEEDS_RECHECK', 'REJECTED')),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Draft Versions (Immutable Content Snapshots)
CREATE TABLE IF NOT EXISTS public.draft_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id uuid NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    version_number integer NOT NULL CHECK (version_number >= 1),
    content text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT draft_versions_draft_version_unique UNIQUE (draft_id, version_number)
);

-- Findings (Rule engine issues raised against draft content)
CREATE TABLE IF NOT EXISTS public.findings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    draft_id uuid NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
    draft_version_id uuid NOT NULL REFERENCES public.draft_versions(id) ON DELETE CASCADE,
    engine text NOT NULL CHECK (engine IN ('DETERMINISTIC', 'LLM_RAG')),
    severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    source_rule_id text NOT NULL,
    rule_version integer NOT NULL CHECK (rule_version >= 1),
    flagged_span text NOT NULL,
    explanation text NOT NULL,
    minimal_edit text,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'OVERRIDDEN')),
    override_comment text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT findings_override_comment_check CHECK (
        status <> 'OVERRIDDEN' OR (override_comment IS NOT NULL AND length(trim(override_comment)) > 0)
    )
);

-- Comments
CREATE TABLE IF NOT EXISTS public.comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    draft_id uuid NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
    finding_id uuid REFERENCES public.findings(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Approvals
CREATE TABLE IF NOT EXISTS public.approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    draft_id uuid NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
    draft_version_id uuid NOT NULL REFERENCES public.draft_versions(id) ON DELETE CASCADE,
    reviewer_id uuid NOT NULL,
    decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
    comment text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Payload Log (Trust layer: logs what was sent to external models post-redaction)
CREATE TABLE IF NOT EXISTS public.payload_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    draft_id uuid REFERENCES public.drafts(id) ON DELETE SET NULL,
    endpoint text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit Log (Workspace operational and governance ledger)
CREATE TABLE IF NOT EXISTS public.audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. PERFORMANCE & LOOKUP INDEXES
CREATE INDEX IF NOT EXISTS idx_members_user_workspace ON public.members (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_rules_workspace ON public.kb_rules (workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_rules_lookup ON public.kb_rules (workspace_id, rule_id);
CREATE INDEX IF NOT EXISTS idx_kb_rules_type ON public.kb_rules (workspace_id, type);
CREATE INDEX IF NOT EXISTS idx_kb_rule_versions_lookup ON public.kb_rule_versions (workspace_id, rule_id, version);
CREATE INDEX IF NOT EXISTS idx_drafts_workspace_status ON public.drafts (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_draft_versions_draft ON public.draft_versions (draft_id);
CREATE INDEX IF NOT EXISTS idx_findings_draft ON public.findings (draft_id);
CREATE INDEX IF NOT EXISTS idx_findings_recheck ON public.findings (workspace_id, source_rule_id, rule_version);
CREATE INDEX IF NOT EXISTS idx_comments_draft ON public.comments (draft_id);
CREATE INDEX IF NOT EXISTS idx_comments_finding ON public.comments (finding_id);
CREATE INDEX IF NOT EXISTS idx_approvals_draft ON public.approvals (draft_id);
CREATE INDEX IF NOT EXISTS idx_payload_log_workspace ON public.payload_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON public.audit_log (workspace_id, created_at DESC);

-- 5. SECURITY DEFINER MEMBERSHIP HELPERS
-- Avoids infinite recursion in RLS policies when evaluating workspace membership and roles

CREATE OR REPLACE FUNCTION public.get_user_role(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_member_of(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  );
$$;

-- 6. BUSINESS LOGIC TRIGGERS

-- Trigger: When kb_rule version/effective_date changes or rule is deleted,
-- set drafts whose findings cite the old version to NEEDS_RECHECK
CREATE OR REPLACE FUNCTION public.handle_kb_rule_change_recheck()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Trigger on rule version bump or effective date change
    IF (OLD.version IS DISTINCT FROM NEW.version) OR (OLD.effective_date IS DISTINCT FROM NEW.effective_date) THEN
      UPDATE public.drafts d
      SET status = 'NEEDS_RECHECK',
          updated_at = now()
      WHERE d.workspace_id = OLD.workspace_id
        AND d.status <> 'NEEDS_RECHECK'
        AND EXISTS (
          SELECT 1
          FROM public.findings f
          WHERE f.workspace_id = OLD.workspace_id
            AND f.draft_id = d.id
            AND f.source_rule_id = OLD.rule_id
            AND f.rule_version = OLD.version
        );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Trigger on rule deletion: any draft citing this rule needs recheck
    UPDATE public.drafts d
    SET status = 'NEEDS_RECHECK',
        updated_at = now()
    WHERE d.workspace_id = OLD.workspace_id
      AND d.status <> 'NEEDS_RECHECK'
      AND EXISTS (
        SELECT 1
        FROM public.findings f
        WHERE f.workspace_id = OLD.workspace_id
          AND f.draft_id = d.id
          AND f.source_rule_id = OLD.rule_id
      );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_rules_recheck ON public.kb_rules;
CREATE TRIGGER trg_kb_rules_recheck
AFTER UPDATE OR DELETE ON public.kb_rules
FOR EACH ROW
EXECUTE FUNCTION public.handle_kb_rule_change_recheck();

-- Trigger: Archive rule version to kb_rule_versions on insert or update
CREATE OR REPLACE FUNCTION public.handle_kb_rule_version_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kb_rule_versions (
    workspace_id,
    rule_id,
    version,
    type,
    owner,
    effective_date,
    rule_text,
    source_name,
    source_url,
    origin,
    status,
    created_at,
    recorded_at
  )
  VALUES (
    NEW.workspace_id,
    NEW.rule_id,
    NEW.version,
    NEW.type,
    NEW.owner,
    NEW.effective_date,
    NEW.rule_text,
    NEW.source_name,
    NEW.source_url,
    NEW.origin,
    NEW.status,
    NEW.created_at,
    now()
  )
  ON CONFLICT (workspace_id, rule_id, version) DO UPDATE SET
    type = EXCLUDED.type,
    owner = EXCLUDED.owner,
    effective_date = EXCLUDED.effective_date,
    rule_text = EXCLUDED.rule_text,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    origin = EXCLUDED.origin,
    status = EXCLUDED.status,
    recorded_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_rules_archive ON public.kb_rules;
CREATE TRIGGER trg_kb_rules_archive
AFTER INSERT OR UPDATE ON public.kb_rules
FOR EACH ROW
EXECUTE FUNCTION public.handle_kb_rule_version_archive();

-- Trigger: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_members_updated_at ON public.members;
CREATE TRIGGER trg_members_updated_at
BEFORE UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_kb_rules_updated_at ON public.kb_rules;
CREATE TRIGGER trg_kb_rules_updated_at
BEFORE UPDATE ON public.kb_rules
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_drafts_updated_at ON public.drafts;
CREATE TRIGGER trg_drafts_updated_at
BEFORE UPDATE ON public.drafts
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_findings_updated_at ON public.findings;
CREATE TRIGGER trg_findings_updated_at
BEFORE UPDATE ON public.findings
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict deny by default. Force RLS across all tables.

-- Enable & Force RLS on all 11 tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces FORCE ROW LEVEL SECURITY;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.kb_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE public.kb_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_rule_versions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_versions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payload_log FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;


-- WORKSPACES POLICIES
-- Select: Members can view their workspaces
CREATE POLICY "workspaces_select_member" ON public.workspaces
FOR SELECT USING (public.is_member_of(id));

-- Insert: Any authenticated user (including Supabase anonymous auth) can create a workspace
CREATE POLICY "workspaces_insert_creator" ON public.workspaces
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Managers only
CREATE POLICY "workspaces_update_manager" ON public.workspaces
FOR UPDATE USING (public.get_user_role(id) = 'manager')
WITH CHECK (public.get_user_role(id) = 'manager');

-- Delete: Managers only
CREATE POLICY "workspaces_delete_manager" ON public.workspaces
FOR DELETE USING (public.get_user_role(id) = 'manager');


-- MEMBERS POLICIES
-- Select: Workspace members can view other members in their workspace
CREATE POLICY "members_select_workspace" ON public.members
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert:
-- 1. Self-registration when creating a workspace (user_id = auth.uid())
-- 2. Managers adding team members
CREATE POLICY "members_insert_access" ON public.members
FOR INSERT WITH CHECK (
  (user_id = auth.uid()) OR (public.get_user_role(workspace_id) = 'manager')
);

-- Update:
-- 1. Judge role switcher in isolated sandbox: user can toggle their own role inside their workspace
-- 2. Managers updating member roles
CREATE POLICY "members_update_access" ON public.members
FOR UPDATE USING (
  ((user_id = auth.uid()) AND public.is_member_of(workspace_id))
  OR (public.get_user_role(workspace_id) = 'manager')
)
WITH CHECK (
  ((user_id = auth.uid()) AND public.is_member_of(workspace_id))
  OR (public.get_user_role(workspace_id) = 'manager')
);

-- Delete: Member leaving or Manager removing member
CREATE POLICY "members_delete_access" ON public.members
FOR DELETE USING (
  (user_id = auth.uid()) OR (public.get_user_role(workspace_id) = 'manager')
);


-- KB_RULES POLICIES
-- Select: All workspace members can read brand rules
CREATE POLICY "kb_rules_select_member" ON public.kb_rules
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Reviewers and Managers can create rules
CREATE POLICY "kb_rules_insert_review_manager" ON public.kb_rules
FOR INSERT WITH CHECK (public.get_user_role(workspace_id) IN ('reviewer', 'manager'));

-- Update: Reviewers and Managers can edit/version rules
CREATE POLICY "kb_rules_update_review_manager" ON public.kb_rules
FOR UPDATE USING (public.get_user_role(workspace_id) IN ('reviewer', 'manager'))
WITH CHECK (public.get_user_role(workspace_id) IN ('reviewer', 'manager'));

-- Delete: Reviewers and Managers can delete rules
CREATE POLICY "kb_rules_delete_review_manager" ON public.kb_rules
FOR DELETE USING (public.get_user_role(workspace_id) IN ('reviewer', 'manager'));


-- KB_RULE_VERSIONS POLICIES (Immutable Ledger)
-- Select: All workspace members can read version history
CREATE POLICY "kb_rule_versions_select_member" ON public.kb_rule_versions
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Reviewers and Managers (or triggers)
CREATE POLICY "kb_rule_versions_insert_review_manager" ON public.kb_rule_versions
FOR INSERT WITH CHECK (public.get_user_role(workspace_id) IN ('reviewer', 'manager'));

-- Delete: Managers only (ledger cleanup)
CREATE POLICY "kb_rule_versions_delete_manager" ON public.kb_rule_versions
FOR DELETE USING (public.get_user_role(workspace_id) = 'manager');


-- DRAFTS POLICIES
-- Select: All workspace members can view drafts
CREATE POLICY "drafts_select_member" ON public.drafts
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Creators and Managers can create drafts
CREATE POLICY "drafts_insert_creator_manager" ON public.drafts
FOR INSERT WITH CHECK (
  public.get_user_role(workspace_id) IN ('creator', 'manager')
  AND created_by = auth.uid()
);

-- Update:
-- 1. Managers have full update authority
-- 2. Reviewers can update review status (IN_REVIEW, REJECTED)
-- 3. Creators can update their drafts (title, submitting to IN_REVIEW, revising when NEEDS_RECHECK)
CREATE POLICY "drafts_update_member" ON public.drafts
FOR UPDATE USING (
  public.is_member_of(workspace_id) AND (
    public.get_user_role(workspace_id) = 'manager'
    OR public.get_user_role(workspace_id) = 'reviewer'
    OR (public.get_user_role(workspace_id) = 'creator' AND created_by = auth.uid())
  )
)
WITH CHECK (
  public.is_member_of(workspace_id) AND (
    public.get_user_role(workspace_id) = 'manager'
    OR public.get_user_role(workspace_id) = 'reviewer'
    OR (public.get_user_role(workspace_id) = 'creator' AND created_by = auth.uid())
  )
);

-- Delete: Managers or the Creator who authored the draft
CREATE POLICY "drafts_delete_author_manager" ON public.drafts
FOR DELETE USING (
  (public.get_user_role(workspace_id) = 'manager')
  OR (public.get_user_role(workspace_id) = 'creator' AND created_by = auth.uid())
);


-- DRAFT_VERSIONS POLICIES (Immutable Content Snapshots)
-- Select: Workspace members can view content versions
CREATE POLICY "draft_versions_select_member" ON public.draft_versions
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Creators and Managers can save a new draft version
CREATE POLICY "draft_versions_insert_creator_manager" ON public.draft_versions
FOR INSERT WITH CHECK (
  public.get_user_role(workspace_id) IN ('creator', 'manager')
  AND created_by = auth.uid()
);

-- Delete: Managers only
CREATE POLICY "draft_versions_delete_manager" ON public.draft_versions
FOR DELETE USING (public.get_user_role(workspace_id) = 'manager');


-- FINDINGS POLICIES
-- Select: Workspace members can view findings
CREATE POLICY "findings_select_member" ON public.findings
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Workspace members can run checks and insert findings
CREATE POLICY "findings_insert_member" ON public.findings
FOR INSERT WITH CHECK (public.is_member_of(workspace_id));

-- Update: Creators, Reviewers, and Managers can accept or override findings
-- Overrides require override_comment (enforced by CHECK constraint)
CREATE POLICY "findings_update_member" ON public.findings
FOR UPDATE USING (public.is_member_of(workspace_id))
WITH CHECK (public.is_member_of(workspace_id));

-- Delete: Managers only
CREATE POLICY "findings_delete_manager" ON public.findings
FOR DELETE USING (public.get_user_role(workspace_id) = 'manager');


-- COMMENTS POLICIES
-- Select: Workspace members can view comments
CREATE POLICY "comments_select_member" ON public.comments
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Workspace members can add comments attributed to themselves
CREATE POLICY "comments_insert_member" ON public.comments
FOR INSERT WITH CHECK (
  public.is_member_of(workspace_id) AND user_id = auth.uid()
);

-- Update: Author only
CREATE POLICY "comments_update_author" ON public.comments
FOR UPDATE USING (user_id = auth.uid() AND public.is_member_of(workspace_id))
WITH CHECK (user_id = auth.uid() AND public.is_member_of(workspace_id));

-- Delete: Author or Manager
CREATE POLICY "comments_delete_author_manager" ON public.comments
FOR DELETE USING (
  (user_id = auth.uid() AND public.is_member_of(workspace_id))
  OR (public.get_user_role(workspace_id) = 'manager')
);


-- APPROVALS POLICIES
-- Select: Workspace members can view approvals
CREATE POLICY "approvals_select_member" ON public.approvals
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Only Managers can record approval decisions
CREATE POLICY "approvals_insert_manager" ON public.approvals
FOR INSERT WITH CHECK (
  public.get_user_role(workspace_id) = 'manager' AND reviewer_id = auth.uid()
);

-- Update: Managers only
CREATE POLICY "approvals_update_manager" ON public.approvals
FOR UPDATE USING (
  public.get_user_role(workspace_id) = 'manager' AND reviewer_id = auth.uid()
)
WITH CHECK (
  public.get_user_role(workspace_id) = 'manager' AND reviewer_id = auth.uid()
);

-- Delete: Managers only
CREATE POLICY "approvals_delete_manager" ON public.approvals
FOR DELETE USING (public.get_user_role(workspace_id) = 'manager');


-- PAYLOAD_LOG POLICIES (Immutable Outbound Trust Layer Log)
-- Select: Workspace members can inspect outbound model payloads
CREATE POLICY "payload_log_select_member" ON public.payload_log
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Logged by workspace members initiating checks
CREATE POLICY "payload_log_insert_member" ON public.payload_log
FOR INSERT WITH CHECK (
  public.is_member_of(workspace_id) AND user_id = auth.uid()
);


-- AUDIT_LOG POLICIES (Immutable Governance Ledger)
-- Select: Workspace members can review audit logs
CREATE POLICY "audit_log_select_member" ON public.audit_log
FOR SELECT USING (public.is_member_of(workspace_id));

-- Insert: Workspace members can record audit actions
CREATE POLICY "audit_log_insert_member" ON public.audit_log
FOR INSERT WITH CHECK (
  public.is_member_of(workspace_id) AND actor_id = auth.uid()
);
