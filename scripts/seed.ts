import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';

export const PUBLIC_SAMPLE_RULES = [
  {
    rule_id: 'WCAG-2.1-1.4.3',
    type: 'ACCESSIBILITY' as const,
    owner: 'W3C WAI',
    effective_date: '2018-06-05',
    version: 1,
    rule_text:
      'Contrast (Minimum): The visual presentation of text and images of text must have a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text (at least 18pt or 14pt bold).',
    source_name: 'W3C Web Content Accessibility Guidelines (WCAG) 2.1 - SC 1.4.3 Contrast (Minimum)',
    source_url: 'https://www.w3.org/TR/WCAG21/#contrast-minimum',
    origin: 'public_sample' as const,
    status: 'ACTIVE' as const,
  },
  {
    rule_id: 'WCAG-2.1-1.1.1',
    type: 'ACCESSIBILITY' as const,
    owner: 'W3C WAI',
    effective_date: '2018-06-05',
    version: 1,
    rule_text:
      'Non-text Content: All non-text content that is presented to the user must have a text alternative (alt text) that serves the equivalent purpose, except for pure decoration which must have empty alt text.',
    source_name: 'W3C Web Content Accessibility Guidelines (WCAG) 2.1 - SC 1.1.1 Non-text Content',
    source_url: 'https://www.w3.org/TR/WCAG21/#non-text-content',
    origin: 'public_sample' as const,
    status: 'ACTIVE' as const,
  },
  {
    rule_id: 'SLACK-BRAND-01',
    type: 'TERM' as const,
    owner: 'Slack Technologies (Salesforce)',
    effective_date: '2021-01-01',
    version: 1,
    rule_text:
      'Brand Voice & Trademark Usage: "Slack" is not used as a noun or verb (e.g., do not say "I will slack you" or "send a slack"). The sign-off "Happy Slacking!" is strictly banned.',
    source_name: 'Slack Brand Guidelines - Trademark and Brand Standards',
    source_url: 'https://brand.slack.com',
    origin: 'public_sample' as const,
    status: 'ACTIVE' as const,
  },
];

/**
 * Idempotently seeds the 3 approved public sample rules into the specified workspace.
 */
export async function seedWorkspaceRules(
  client: SupabaseClient<Database>,
  workspaceId: string
) {
  for (const rule of PUBLIC_SAMPLE_RULES) {
    const { error } = await client.from('kb_rules').upsert(
      {
        workspace_id: workspaceId,
        ...rule,
      },
      { onConflict: 'workspace_id,rule_id' }
    );

    if (error) {
      throw new Error(`Failed to seed rule ${rule.rule_id}: ${error.message}`);
    }
  }
}

async function main() {
  const targetWorkspaceId = process.env.TARGET_WORKSPACE_ID || '00000000-0000-0000-0000-000000000001';
  console.log(`[Seed] Starting seed for workspace: ${targetWorkspaceId}`);

  // Dynamic import of admin client
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const adminClient = createAdminClient();

  // Ensure workspace exists
  const { error: wsError } = await adminClient.from('workspaces').upsert(
    {
      id: targetWorkspaceId,
      name: 'Public Sample Standards',
    },
    { onConflict: 'id' }
  );

  if (wsError) {
    throw new Error(`Failed to upsert target workspace: ${wsError.message}`);
  }

  await seedWorkspaceRules(adminClient, targetWorkspaceId);
  console.log(`[Seed] Successfully seeded ${PUBLIC_SAMPLE_RULES.length} public rules.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Seed Error]:', err);
    process.exit(1);
  });
}
