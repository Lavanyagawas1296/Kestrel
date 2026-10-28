import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

function makeScopedClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function runLiveRlsTests() {
  console.log('=== RUNNING LIVE SUPABASE RLS TESTS ===');
  console.log('Target instance:', SUPABASE_URL);

  const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // 1. Create two anonymous sessions
  const { data: authA, error: errA } = await anonClient.auth.signInAnonymously();
  if (errA || !authA.session) throw new Error('Session A creation failed: ' + errA?.message);
  const userA = authA.user;
  const clientA = makeScopedClient(authA.session.access_token);
  console.log('[Auth] Session A initialized. User ID:', userA.id);

  const { data: authB, error: errB } = await anonClient.auth.signInAnonymously();
  if (errB || !authB.session) throw new Error('Session B creation failed: ' + errB?.message);
  const userB = authB.user;
  const clientB = makeScopedClient(authB.session.access_token);
  console.log('[Auth] Session B initialized. User ID:', userB.id);

  // 2. User A creates Workspace A
  const wsA_id = crypto.randomUUID();
  const { error: wsAErr } = await clientA.from('workspaces').insert({ id: wsA_id, name: 'Workspace A (Creator)' });
  if (wsAErr) throw new Error('Failed to create Workspace A: ' + wsAErr.message);

  const { error: memAErr } = await clientA.from('members').insert({ workspace_id: wsA_id, user_id: userA.id, role: 'creator' });
  if (memAErr) throw new Error('Failed to add Member A: ' + memAErr.message);
  console.log('[Setup] User A created Workspace A as role: creator');

  // 3. User B creates Workspace B
  const wsB_id = crypto.randomUUID();
  const { error: wsBErr } = await clientB.from('workspaces').insert({ id: wsB_id, name: 'Workspace B (Manager)' });
  if (wsBErr) throw new Error('Failed to create Workspace B: ' + wsBErr.message);

  const { error: memBErr } = await clientB.from('members').insert({ workspace_id: wsB_id, user_id: userB.id, role: 'manager' });
  if (memBErr) throw new Error('Failed to add Member B: ' + memBErr.message);
  console.log('[Setup] User B created Workspace B as role: manager');

  // TEST 1: Cross-workspace read denial
  console.log('\n--- TEST 1: Cross-Workspace Read Denial ---');
  const { data: bReadingA } = await clientB.from('workspaces').select('*').eq('id', wsA_id);
  const { data: aReadingB } = await clientA.from('workspaces').select('*').eq('id', wsB_id);

  const bBlocked = (!bReadingA || bReadingA.length === 0);
  const aBlocked = (!aReadingB || aReadingB.length === 0);
  console.log('User B reading Workspace A:', bBlocked ? 'DENIED / 0 rows returned (PASS)' : 'LEAKED (FAIL)');
  console.log('User A reading Workspace B:', aBlocked ? 'DENIED / 0 rows returned (PASS)' : 'LEAKED (FAIL)');
  if (!bBlocked || !aBlocked) throw new Error('Cross-workspace read RLS breach!');

  // TEST 2: Cross-workspace write denial
  console.log('\n--- TEST 2: Cross-Workspace Write Denial ---');
  const fakeDraftId = crypto.randomUUID();
  const { error: bWriteAErr } = await clientB.from('drafts').insert({
    id: fakeDraftId,
    workspace_id: wsA_id,
    title: 'Cross-workspace injection',
    status: 'DRAFT',
    created_by: userB.id,
  });
  console.log('User B inserting draft into Workspace A:', bWriteAErr ? `BLOCKED (${bWriteAErr.message}) (PASS)` : 'ALLOWED (FAIL)');
  if (!bWriteAErr) throw new Error('Cross-workspace draft insert was allowed!');

  // TEST 3: Role limits - Creator cannot create KB rules
  console.log('\n--- TEST 3: Role Limits - Creator Cannot Create KB Rules ---');
  const { error: creatorRuleErr } = await clientA.from('kb_rules').insert({
    workspace_id: wsA_id,
    rule_id: 'TEST-CREATOR-01',
    type: 'TERM',
    owner: 'Creator User',
    version: 1,
    rule_text: 'Creator trying to create rule',
    source_name: 'Unauthorized',
    source_url: 'https://example.com',
    origin: 'custom',
    status: 'ACTIVE',
  });
  console.log('Creator inserting KB rule:', creatorRuleErr ? `BLOCKED (${creatorRuleErr.message}) (PASS)` : 'ALLOWED (FAIL)');
  if (!creatorRuleErr) throw new Error('Creator was improperly allowed to insert a KB rule!');

  // TEST 4: Role limits - Creator cannot approve drafts
  console.log('\n--- TEST 4: Role Limits - Creator Cannot Approve Drafts ---');
  const draftAId = crypto.randomUUID();
  const versionAId = crypto.randomUUID();
  await clientA.from('drafts').insert({ id: draftAId, workspace_id: wsA_id, title: 'Draft A', status: 'DRAFT', created_by: userA.id });
  await clientA.from('draft_versions').insert({ id: versionAId, draft_id: draftAId, workspace_id: wsA_id, version_number: 1, content: 'Some content', created_by: userA.id });

  const { error: creatorApproveErr } = await clientA.from('approvals').insert({
    workspace_id: wsA_id,
    draft_id: draftAId,
    draft_version_id: versionAId,
    reviewer_id: userA.id,
    decision: 'APPROVED',
    comment: 'Self approval',
  });
  console.log('Creator creating approval:', creatorApproveErr ? `BLOCKED (${creatorApproveErr.message}) (PASS)` : 'ALLOWED (FAIL)');
  if (!creatorApproveErr) throw new Error('Creator was improperly allowed to approve a draft!');

  // TEST 5: Manager CAN create rules and approvals
  console.log('\n--- TEST 5: Manager Authority - Manager CAN Create Rules & Approvals ---');
  const { error: mgrRuleErr } = await clientB.from('kb_rules').insert({
    workspace_id: wsB_id,
    rule_id: 'SLACK-BRAND-01',
    type: 'TERM',
    owner: 'Slack Technologies',
    version: 1,
    rule_text: 'Brand Voice & Trademark Usage: Slack is not a verb.',
    source_name: 'Slack Brand Guidelines',
    source_url: 'https://brand.slack.com',
    origin: 'custom',
    status: 'ACTIVE',
  });
  console.log('Manager inserting KB rule:', mgrRuleErr ? `FAILED: ${mgrRuleErr.message}` : 'SUCCESS (PASS)');
  if (mgrRuleErr) throw mgrRuleErr;

  const draftBId = crypto.randomUUID();
  const versionBId = crypto.randomUUID();
  await clientB.from('drafts').insert({ id: draftBId, workspace_id: wsB_id, title: 'Draft B', status: 'DRAFT', created_by: userB.id });
  await clientB.from('draft_versions').insert({ id: versionBId, draft_id: draftBId, workspace_id: wsB_id, version_number: 1, content: 'Manager draft', created_by: userB.id });

  const { error: mgrApproveErr } = await clientB.from('approvals').insert({
    workspace_id: wsB_id,
    draft_id: draftBId,
    draft_version_id: versionBId,
    reviewer_id: userB.id,
    decision: 'APPROVED',
    comment: 'Manager approval verified',
  });
  console.log('Manager creating approval:', mgrApproveErr ? `FAILED: ${mgrApproveErr.message}` : 'SUCCESS (PASS)');
  if (mgrApproveErr) throw mgrApproveErr;

  console.log('\n=== ALL LIVE SUPABASE RLS & ROLE TESTS PASSED! ===');
}

runLiveRlsTests().catch((e) => {
  console.error('Test Suite Failed:', e);
  process.exit(1);
});
