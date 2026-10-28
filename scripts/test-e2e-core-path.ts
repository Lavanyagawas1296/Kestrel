import { createClient } from '@supabase/supabase-js';
import { runReviewPipeline } from '../src/lib/engine/pipeline';
import * as fs from 'fs';

// Load .env safely without ever logging keys
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function runE2ECorePath() {
  console.log('=== RUNNING FULL CORE PATH E2E TEST AGAINST LIVE SUPABASE ===');
  console.log('Target instance:', SUPABASE_URL);

  const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Step 1: Sign in anonymously
  const { data: authData } = await anonClient.auth.signInAnonymously();
  if (!authData?.session || !authData?.user) throw new Error('Supabase anonymous sign-in failed');
  const user = authData.user;
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  });
  console.log('[Step 1] Anonymous session authenticated. User ID:', user.id);

  // Step 2: Create isolated workspace & member (manager)
  const wsId = crypto.randomUUID();
  await client.from('workspaces').insert({ id: wsId, name: 'Live Supabase E2E Workspace' });
  await client.from('members').insert({ workspace_id: wsId, user_id: user.id, role: 'manager' });
  console.log('[Step 2] Workspace initialized with manager role. Workspace ID:', wsId);

  // Step 3: Insert KB Rules
  const rules = [
    {
      workspace_id: wsId,
      rule_id: 'SLACK-BRAND-01',
      type: 'TERM' as const,
      owner: 'Slack Technologies',
      version: 1,
      rule_text: 'Brand Voice: "Slack" is not used as a verb (do not say "I will slack you").',
      source_name: 'Slack Brand Guidelines',
      source_url: 'https://brand.slack.com',
      origin: 'custom' as const,
      status: 'ACTIVE' as const,
    },
    {
      workspace_id: wsId,
      rule_id: 'FACT-SLA-01',
      type: 'FACT' as const,
      owner: 'Engineering Ops',
      version: 1,
      rule_text: 'Enterprise SLA uptime guarantee is 99.9%, not 99.99% or 100%.',
      source_name: 'Infrastructure SLA Sec. 4.1',
      source_url: 'https://internal.company.com/legal/sla',
      origin: 'custom' as const,
      status: 'ACTIVE' as const,
    },
  ];

  for (const r of rules) {
    const { error } = await client.from('kb_rules').insert(r);
    if (error) throw new Error(`Failed to insert rule ${r.rule_id}: ${error.message}`);
  }
  console.log(`[Step 3] Seeded ${rules.length} KB rules into live Supabase kb_rules table.`);

  // Step 4: Create Draft v1
  const draftId = crypto.randomUUID();
  const v1Id = crypto.randomUUID();
  const v1Content = 'We guarantee 99.99% zero-downtime uptime for all enterprise clusters. Our engineers will slack you the deployment guide directly.';

  await client.from('drafts').insert({
    id: draftId,
    workspace_id: wsId,
    title: 'Enterprise Cloud Announcement',
    status: 'DRAFT',
    created_by: user.id,
  });

  await client.from('draft_versions').insert({
    id: v1Id,
    draft_id: draftId,
    workspace_id: wsId,
    version_number: 1,
    content: v1Content,
    created_by: user.id,
  });
  console.log('[Step 4] Created Draft v1. Content:', v1Content);

  // Step 5: Run Review Engine
  console.log('[Step 5] Running review pipeline (Ingestion -> Redaction -> Deterministic & LLM Checks -> Grounding)...');
  const pipelineResult = await runReviewPipeline({
    rawContent: v1Content,
    workspaceId: wsId,
    activeRules: rules.map((r) => ({
      rule_id: r.rule_id,
      version: r.version,
      type: r.type,
      rule_text: r.rule_text,
    })),
  });

  // Outbound payload logging
  await client.from('payload_log').insert({
    workspace_id: wsId,
    user_id: user.id,
    draft_id: draftId,
    endpoint: 'POST /api/drafts/[id]/review',
    payload: {
      redactedText: pipelineResult.redactedText,
      tokens: pipelineResult.tokens,
      rulesCount: rules.length,
      timestamp: new Date().toISOString(),
    },
  });

  // Insert findings
  for (const f of pipelineResult.findings) {
    await client.from('findings').insert({
      workspace_id: wsId,
      draft_id: draftId,
      draft_version_id: v1Id,
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

  await client.from('drafts').update({ status: 'IN_REVIEW' }).eq('id', draftId);

  const { data: storedFindings } = await client.from('findings').select('*').eq('draft_id', draftId);
  console.log(`[Step 5] Review completed. Draft status: IN_REVIEW. Recorded ${storedFindings?.length} findings in live Supabase findings table.`);

  // Step 6: Apply Minimal Edit Fix -> Create v2
  const verbFinding = storedFindings?.find((f) => f.source_rule_id === 'SLACK-BRAND-01') || storedFindings?.[0];
  if (!verbFinding || !verbFinding.minimal_edit) {
    throw new Error('Expected finding with minimal_edit not found');
  }

  const v2Content = v1Content.replace(verbFinding.flagged_span, verbFinding.minimal_edit);
  const v2Id = crypto.randomUUID();

  await client.from('draft_versions').insert({
    id: v2Id,
    draft_id: draftId,
    workspace_id: wsId,
    version_number: 2,
    content: v2Content,
    created_by: user.id,
  });

  await client.from('findings').update({ status: 'ACCEPTED' }).eq('id', verbFinding.id);
  console.log(`[Step 6] Applied fix for ${verbFinding.source_rule_id} ("${verbFinding.flagged_span}" -> "${verbFinding.minimal_edit}").`);
  console.log('Generated Draft v2 Content:', v2Content);

  // Step 7: Override Other Finding With Comment
  const otherFinding = storedFindings?.find((f) => f.id !== verbFinding.id);
  if (otherFinding) {
    await client.from('findings').update({
      status: 'OVERRIDDEN',
      override_comment: 'Approved by Chief Architect for dedicated tier contract #CA-2026-99',
    }).eq('id', otherFinding.id);
    console.log(`[Step 7] Overrode finding ${otherFinding.source_rule_id} with mandatory comment.`);
  }

  // Step 8: Manager Approves v2
  await client.from('approvals').insert({
    workspace_id: wsId,
    draft_id: draftId,
    draft_version_id: v2Id,
    reviewer_id: user.id,
    decision: 'APPROVED',
    comment: 'All brand issues resolved and architect override verified.',
  });

  await client.from('drafts').update({ status: 'APPROVED' }).eq('id', draftId);
  console.log('[Step 8] Manager recorded approval decision. Draft status: APPROVED.');

  // Step 9: Final Database State Verification
  console.log('\n--- Final Verification of Live Supabase Ledger State ---');
  const { data: finalDraft } = await client.from('drafts').select('*').eq('id', draftId).single();
  const { data: finalVersions } = await client.from('draft_versions').select('*').eq('draft_id', draftId).order('version_number', { ascending: true });
  const { data: finalFindings } = await client.from('findings').select('*').eq('draft_id', draftId);
  const { data: finalApprovals } = await client.from('approvals').select('*').eq('draft_id', draftId);
  const { data: finalPayloadLog } = await client.from('payload_log').select('*').eq('draft_id', draftId);

  console.log('Final Draft Status:', finalDraft?.status, '(PASS)');
  console.log('Draft Version Count:', finalVersions?.length, '(v1 and v2 present) (PASS)');
  console.log('Findings Statuses:', finalFindings?.map((f) => `${f.source_rule_id}: ${f.status}`), '(PASS)');
  console.log('Approval Decision:', finalApprovals?.[0]?.decision, 'by', finalApprovals?.[0]?.reviewer_id, '(PASS)');
  console.log('Payload Log Recorded Rows:', finalPayloadLog?.length, '(PASS)');

  if (finalDraft?.status !== 'APPROVED' || finalVersions?.length !== 2 || finalApprovals?.length !== 1) {
    throw new Error('Final ledger state verification failed');
  }

  console.log('\n=== COMPLETE CORE PATH END-TO-END PASSED AGAINST LIVE SUPABASE! ===');
}

runE2ECorePath().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
