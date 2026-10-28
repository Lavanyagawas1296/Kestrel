# Kestrel — Pre-Publication Brand Governance Engine

Kestrel is a pre-publication brand-governance tool designed to prevent off-brand claims, banned terminology, and inaccessible visual assets from reaching live posts. Creators submit drafts (text, Markdown, DOCX, PDF, PNG/JPG) which are evaluated against a versioned Brand Knowledge Base. Every issue is flagged with rule citations, explanation, severity, and minimal-edit suggestions. Creators accept or override flags (with mandatory comments), and managers review diffs and grant approvals.

---

## Data Layer Overview

The data layer is built on **PostgreSQL** (with `pgvector` for embedding retrieval) and **Supabase Row Level Security (RLS)**. It guarantees strict multi-tenant isolation across workspaces and role enforcement at the database level.

### Schema Architecture (`supabase/migrations/20261027000000_init_kestrel.sql`)

The database consists of 11 core tables:

| Table | Description | Primary Key | Key Foreign Keys & Constraints |
|---|---|---|---|
| `workspaces` | Workspace tenant boundary | `id` (uuid) | - |
| `members` | Workspace membership & role mapping (`creator`, `reviewer`, `manager`) | `id` (uuid) | `workspace_id` -> `workspaces(id)` on delete cascade, `UNIQUE(workspace_id, user_id)` |
| `kb_rules` | Active Brand Knowledge Base rules | `id` (uuid) | `workspace_id` -> `workspaces(id)`, `UNIQUE(workspace_id, rule_id)`, type in `TONE`, `TERM`, `FACT`, `VISUAL`, `ACCESSIBILITY` |
| `kb_rule_versions` | Immutable version archive for rule change tracking | `id` (uuid) | `workspace_id` -> `workspaces(id)`, `UNIQUE(workspace_id, rule_id, version)` |
| `drafts` | Content submission header | `id` (uuid) | `workspace_id` -> `workspaces(id)`, status in `DRAFT`, `IN_REVIEW`, `APPROVED`, `NEEDS_RECHECK`, `REJECTED` |
| `draft_versions` | Immutable draft content snapshots (v1, v2...) | `id` (uuid) | `draft_id` -> `drafts(id)` on delete cascade, `UNIQUE(draft_id, version_number)` |
| `findings` | Issues raised against draft content by deterministic or LLM engines | `id` (uuid) | `draft_id` -> `drafts(id)`, `draft_version_id` -> `draft_versions(id)`, `status` in `PENDING`, `ACCEPTED`, `OVERRIDDEN`. Requires non-empty `override_comment` when status is `OVERRIDDEN` |
| `comments` | Discussion threads on drafts or specific findings | `id` (uuid) | `draft_id` -> `drafts(id)`, `finding_id` -> `findings(id)` (nullable) |
| `approvals` | Formal approval or rejection record by a manager | `id` (uuid) | `draft_id` -> `drafts(id)`, `draft_version_id` -> `draft_versions(id)` |
| `payload_log` | Trust layer audit log of outbound payloads sent to models post-redaction | `id` (uuid) | `workspace_id` -> `workspaces(id)` |
| `audit_log` | Operational and governance event log | `id` (uuid) | `workspace_id` -> `workspaces(id)` |

---

## Row Level Security (RLS) Policy Matrix

Row Level Security is enabled and **forced** (`FORCE ROW LEVEL SECURITY`) across all 11 tables. No user can read or modify data belonging to another workspace.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `workspaces` | Workspace members (`is_member_of`) | Authenticated / Anonymous users (`auth.uid() IS NOT NULL`) | `manager` only | `manager` only |
| `members` | Workspace members | Self (workspace creator) OR `manager` | Self (judge role switcher inside session workspace) OR `manager` | Self (leave workspace) OR `manager` |
| `kb_rules` | Workspace members | `manager`, `reviewer` | `manager`, `reviewer` | `manager`, `reviewer` |
| `kb_rule_versions` | Workspace members | `manager`, `reviewer` (and system trigger) | Denied (immutable ledger) | `manager` only |
| `drafts` | Workspace members | `creator`, `manager` (`created_by = auth.uid()`) | `manager`, `reviewer`, or `creator` author | `manager` or `creator` author |
| `draft_versions` | Workspace members | `creator`, `manager` (`created_by = auth.uid()`) | Denied (immutable content snapshot) | `manager` only |
| `findings` | Workspace members | Workspace members | Workspace members (`ACCEPTED` or `OVERRIDDEN` with comment) | `manager` only |
| `comments` | Workspace members | Workspace members (`user_id = auth.uid()`) | Comment author (`user_id = auth.uid()`) | Comment author OR `manager` |
| `approvals` | Workspace members | `manager` only (`reviewer_id = auth.uid()`) | `manager` only | `manager` only |
| `payload_log` | Workspace members | Workspace members (`user_id = auth.uid()`) | Denied (immutable trust log) | Denied (immutable trust log) |
| `audit_log` | Workspace members | Workspace members (`actor_id = auth.uid()`) | Denied (immutable audit log) | Denied (immutable audit log) |

---

## Autonomous Judge Experience (No Sign-In Required)

Judges can explore and evaluate the application without signing up:
1. Supabase anonymous authentication creates an isolated session with a unique `auth.uid()`.
2. A dedicated sandbox workspace is initialized for the session and seeded with the approved public rules.
3. The member row is created with `role = 'manager'`.
4. The Judge **Role Switcher** allows switching between `creator`, `reviewer`, and `manager` within their sandbox workspace:
   ```sql
   CREATE POLICY "members_update_access" ON public.members
   FOR UPDATE USING (
     ((user_id = auth.uid()) AND public.is_member_of(workspace_id))
     OR (public.get_user_role(workspace_id) = 'manager')
   );
   ```
5. RLS ensures judges have zero visibility into any other judge's or workspace's data.

---

## Integrity Triggers

### 1. Dynamic Rule Recheck Trigger (`trg_kb_rules_recheck`)
When any Knowledge Base rule version or effective date is updated, or when a rule is deleted, any draft whose findings cite the old rule version or the deleted rule is automatically set to `NEEDS_RECHECK`:
```sql
CREATE TRIGGER trg_kb_rules_recheck
AFTER UPDATE OR DELETE ON public.kb_rules
FOR EACH ROW EXECUTE FUNCTION public.handle_kb_rule_change_recheck();
```

### 2. Automatic Rule Version Archive (`trg_kb_rules_archive`)
Every insertion or version update to `kb_rules` automatically creates an archived historical record in `kb_rule_versions`.

---

## Approved Public Seed Data

No fake or placeholder business data is included. Only verifiable, cited public standards are seeded (`origin = 'public_sample'`):

1. **WCAG 2.1 AA 1.4.3 Contrast (Minimum)**:
   - Rule ID: `WCAG-2.1-1.4.3`
   - Owner: `W3C WAI`
   - Citation: `https://www.w3.org/TR/WCAG21/#contrast-minimum`
   - Requirement: 4.5:1 for normal text, 3:1 for large text.
2. **WCAG 2.1 AA 1.1.1 Non-text Content (Alt Text)**:
   - Rule ID: `WCAG-2.1-1.1.1`
   - Owner: `W3C WAI`
   - Citation: `https://www.w3.org/TR/WCAG21/#non-text-content`
   - Requirement: Meaningful alternative text for non-text content.
3. **Slack Public Brand Guidelines**:
   - Rule ID: `SLACK-BRAND-01`
   - Owner: `Slack Technologies (Salesforce)`
   - Citation: `https://brand.slack.com`
   - Requirement: "Slack" is not used as a noun or verb; "Happy Slacking!" sign-off is banned.

Synthetic evaluation strings (such as false uptime claims) exist strictly under `/eval/fixtures` and are labeled `synthetic`, never loaded into application data.

---

## Security Implementation

- **Service-Role Key Protection**: `createAdminClient()` throws an immediate fatal error if called in a browser bundle.
- **Untrusted Text Handling**: All draft text is treated as untrusted and wrapped in XML boundary tags (`wrapInUntrustedBoundary`) to prevent prompt injection in downstream LLM components.
- **File Upload Limits & Magic Bytes**: Verification of headers for PDF (`%PDF-`), PNG (`\x89PNG\r\n\x1a\n`), JPEG (`0xFFD8FF`), and DOCX (`PK\x03\x04`), alongside size limits (10MB documents, 5MB images).
- **API Rate Limiting**: Built-in sliding-window limiter (`checkRateLimit`).

---

## Development & Testing Commands

```bash
# Run automated offline unit tests (33 tests across 4 suites in PGlite)
npm test

# Run production build
npm run build

# Live Supabase Dual-Session Anonymous RLS Test
npx tsx scripts/test-live-supabase-rls.ts

# Live Gemini LLM Review Test (with Grounding Drops & Audit Logging)
npx tsx scripts/test-live-gemini.ts

# Live Full Path End-to-End Test (Draft -> Review -> Fix v2 -> Manager Approve)
npx tsx scripts/test-e2e-core-path.ts

# Serverless Buffer Parsers Check (PDF, DOCX, PNG)
npx tsx scripts/test-serverless-parsers.ts
```

---

## Production Deployment on Vercel

Kestrel is architected for zero-configuration GitHub integration on Vercel.

### Vercel Dashboard Environment Variables Checklist

Add the following environment variables in your Vercel Project Settings (**Settings > Environment Variables**):

| Variable Name | Required | Description | Example / Target |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL | `https://your-project-ref.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase publishable / anon key | `sb_publishable_...` |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key (for live review engine) | Configured in Google AI Studio |
| `GEMINI_MODEL` | Optional | LLM model name (defaults to `gemini-3.5-flash-lite`) | `gemini-3.5-flash-lite` |
| `USE_PGLITE` | Optional | Storage mode (`false` in production, `true` for offline unit tests) | `false` |
| `NEXT_PUBLIC_APP_URL` | Optional | Canonical deployment URL | `https://kestrel-governance.vercel.app` |

All Serverless API routes are configured with:
```ts
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
```
allowing full compatibility with native binary/buffer parsing (`mammoth`, `pngjs`, and `pdf-parse`).
