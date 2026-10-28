import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';

import { PUBLIC_SAMPLE_RULES } from '../src/lib/constants/sample-rules';
export { PUBLIC_SAMPLE_RULES };

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
