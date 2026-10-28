import { workspaceService } from '../src/lib/services/workspace-service';
import * as fs from 'fs';

// Safely load .env
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0 && !line.startsWith('#')) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function run() {
  console.log('=== VERIFYING WORKSPACE-SERVICE FULL FLOW AGAINST LIVE SUPABASE ===');
  console.log('isSupabase:', workspaceService.isSupabase);

  // 1. Init Sandbox Session
  const session = await workspaceService.initSandboxSession();
  console.log('[Step 1] Initialized Sandbox. Workspace:', session.workspaceId, 'User:', session.userId, 'Role:', session.role);
  if (!session.token) throw new Error('Session has no auth token');

  // 2. Save KB Rule
  const rule = await workspaceService.saveRule(
    session.workspaceId,
    {
      rule_id: 'SLACK-BRAND-01',
      type: 'TERM',
      owner: 'Slack Technologies',
      effective_date: '2024-01-01',
      version: 1,
      rule_text: 'Brand Voice: "Slack" is not used as a verb (do not say "I will slack you").',
      source_name: 'Slack Brand Guidelines',
      source_url: 'https://brand.slack.com',
      status: 'ACTIVE',
    },
    session.token
  );
  console.log('[Step 2] Saved KB Rule:', rule.rule_id, 'version:', rule.version);

  // 3. Create Draft v1
  const draft = await workspaceService.createDraft(
    session.workspaceId,
    session.userId,
    'Enterprise Messaging Announcement',
    'We are rolling out Kestrel Cloud. If you need assistance, our engineers will slack you the deployment guide.',
    session.token
  );
  if (!draft) throw new Error('Failed to create draft');
  console.log('[Step 3] Created Draft v1:', draft.id, 'Versions:', draft.versions.length);

  // 4. Run Review
  console.log('[Step 4] Running review on draft...');
  const reviewResult = await workspaceService.reviewDraft(
    session.workspaceId,
    session.userId,
    draft.id,
    undefined,
    session.token
  );
  console.log('[Step 4] Review complete. Status:', reviewResult.draft?.status, 'Findings:', reviewResult.draft?.findings.length);

  const verbFinding = reviewResult.draft?.findings.find((f: any) => f.source_rule_id === 'SLACK-BRAND-01');
  if (!verbFinding) throw new Error('Expected finding for SLACK-BRAND-01 not found');
  console.log('[Step 4] Found expected finding:', verbFinding.flagged_span, '-> suggestion:', verbFinding.minimal_edit);

  // 5. Apply Fix
  console.log('[Step 5] Applying fix...');
  const v2Draft = await workspaceService.applyFix(
    session.workspaceId,
    session.userId,
    verbFinding.id,
    session.token
  );
  if (!v2Draft) throw new Error('Failed to apply fix');
  console.log('[Step 5] Fix applied. Draft now has', v2Draft.versions.length, 'versions. Latest version content:', v2Draft.versions[1]?.content);

  // 6. Manager Approves Draft
  console.log('[Step 6] Manager approving draft...');
  const approvedDraft = await workspaceService.approveDraft(
    session.workspaceId,
    session.userId,
    draft.id,
    'APPROVED',
    'Reviewed and verified by Brand Safety Team.',
    session.token
  );
  if (!approvedDraft) throw new Error('Failed to approve draft');
  console.log('[Step 6] Draft approved! Status:', approvedDraft.status, 'Approvals:', approvedDraft.approvals.length);

  // 7. Verify Outbound Payload Log
  const logs = await workspaceService.getPayloadLogs(session.workspaceId, session.token);
  console.log('[Step 7] Payload log count:', logs.length);
  if (logs.length === 0) throw new Error('Expected at least 1 payload_log entry');

  console.log('=== WORKSPACE-SERVICE FULL CORE PATH VERIFICATION PASSED ON LIVE SUPABASE ===');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
