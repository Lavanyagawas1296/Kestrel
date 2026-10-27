-- Idempotent Seed Script for Kestrel
-- Seeds ONLY the 3 approved public sources cited in the specification.
-- All rows are marked origin = 'public_sample'.
-- No placeholder users, counts, or fictional business rules.

-- 1. Default Sample Workspace (for local development and demo testing)
INSERT INTO public.workspaces (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Public Sample Standards')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();

-- 2. Approved Public Brand & Accessibility Rules
-- Rule 1: WCAG 2.1 AA 1.4.3 Contrast
INSERT INTO public.kb_rules (
    workspace_id,
    rule_id,
    type,
    owner,
    effective_date,
    version,
    rule_text,
    source_name,
    source_url,
    origin,
    status
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'WCAG-2.1-1.4.3',
    'ACCESSIBILITY',
    'W3C WAI',
    '2018-06-05',
    1,
    'Contrast (Minimum): The visual presentation of text and images of text must have a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text (at least 18pt or 14pt bold).',
    'W3C Web Content Accessibility Guidelines (WCAG) 2.1 - SC 1.4.3 Contrast (Minimum)',
    'https://www.w3.org/TR/WCAG21/#contrast-minimum',
    'public_sample',
    'ACTIVE'
)
ON CONFLICT (workspace_id, rule_id) DO UPDATE SET
    type = EXCLUDED.type,
    owner = EXCLUDED.owner,
    effective_date = EXCLUDED.effective_date,
    version = EXCLUDED.version,
    rule_text = EXCLUDED.rule_text,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    origin = EXCLUDED.origin,
    status = EXCLUDED.status,
    updated_at = now();

-- Rule 2: WCAG 2.1 AA 1.1.1 Non-text Content (Alt Text)
INSERT INTO public.kb_rules (
    workspace_id,
    rule_id,
    type,
    owner,
    effective_date,
    version,
    rule_text,
    source_name,
    source_url,
    origin,
    status
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'WCAG-2.1-1.1.1',
    'ACCESSIBILITY',
    'W3C WAI',
    '2018-06-05',
    1,
    'Non-text Content: All non-text content that is presented to the user must have a text alternative (alt text) that serves the equivalent purpose, except for pure decoration which must have empty alt text.',
    'W3C Web Content Accessibility Guidelines (WCAG) 2.1 - SC 1.1.1 Non-text Content',
    'https://www.w3.org/TR/WCAG21/#non-text-content',
    'public_sample',
    'ACTIVE'
)
ON CONFLICT (workspace_id, rule_id) DO UPDATE SET
    type = EXCLUDED.type,
    owner = EXCLUDED.owner,
    effective_date = EXCLUDED.effective_date,
    version = EXCLUDED.version,
    rule_text = EXCLUDED.rule_text,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    origin = EXCLUDED.origin,
    status = EXCLUDED.status,
    updated_at = now();

-- Rule 3: Slack Public Brand Guidelines (Noun/verb misuse and banned sign-off)
INSERT INTO public.kb_rules (
    workspace_id,
    rule_id,
    type,
    owner,
    effective_date,
    version,
    rule_text,
    source_name,
    source_url,
    origin,
    status
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'SLACK-BRAND-01',
    'TERM',
    'Slack Technologies (Salesforce)',
    '2021-01-01',
    1,
    'Brand Voice & Trademark Usage: "Slack" is not used as a noun or verb (e.g., do not say "I will slack you" or "send a slack"). The sign-off "Happy Slacking!" is strictly banned.',
    'Slack Brand Guidelines - Trademark and Brand Standards',
    'https://brand.slack.com',
    'public_sample',
    'ACTIVE'
)
ON CONFLICT (workspace_id, rule_id) DO UPDATE SET
    type = EXCLUDED.type,
    owner = EXCLUDED.owner,
    effective_date = EXCLUDED.effective_date,
    version = EXCLUDED.version,
    rule_text = EXCLUDED.rule_text,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    origin = EXCLUDED.origin,
    status = EXCLUDED.status,
    updated_at = now();
