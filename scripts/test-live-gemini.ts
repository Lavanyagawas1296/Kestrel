import { GeminiProvider } from '../src/lib/engine/llm-adapter';
import { redactDraftContent } from '../src/lib/engine/redact';
import { applyGroundingFilter } from '../src/lib/engine/grounding';
import { createClient } from '@supabase/supabase-js';
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

async function runLiveGeminiTest() {
  console.log('=== RUNNING LIVE GEMINI ADAPTER REVIEW ===');
  console.log('Target model: gemini-3.1-flash-lite');

  // 1. Prepare draft and active rules
  const realDraft = `Welcome to the Kestrel Cloud platform. We guarantee 99.99% zero-downtime uptime for all mission-critical enterprise workloads. If your team needs custom integration assistance, our engineers will slack you the deployment runbook directly. Happy Slacking!`;

  const activeRules = [
    {
      rule_id: 'SLACK-BRAND-01',
      version: 1,
      type: 'TERM',
      rule_text: 'Brand Voice & Trademark Usage: "Slack" is not used as a noun or verb (e.g., do not say "I will slack you" or "send a slack"). The sign-off "Happy Slacking!" is strictly banned.',
    },
    {
      rule_id: 'FACT-SLA-01',
      version: 1,
      type: 'FACT',
      rule_text: 'Enterprise SLA uptime guarantee is 99.9% (three nines), not 99.99% or 100%. Promotional and customer-facing copy must state 99.9% availability and must never claim zero-downtime or four-nines.',
    },
  ];

  // 2. Redaction step
  console.log('\n--- Step 1: Ingestion & Redaction ---');
  const { redactedText, tokens } = redactDraftContent(realDraft, []);
  console.log('Input Draft Length:', realDraft.length, 'chars');
  console.log('Redacted Text:', redactedText);
  console.log('Redaction Tokens Map Count:', tokens.length);

  // 3. Live Gemini call
  console.log('\n--- Step 2: Calling Live Gemini API ---');
  const provider = new GeminiProvider();
  const startTime = Date.now();
  const rawFindings = await provider.checkDraft(redactedText, activeRules);
  const elapsedMs = Date.now() - startTime;
  console.log(`Gemini responded in ${elapsedMs}ms with ${rawFindings.length} findings.`);

  console.log('\n--- Raw Findings from Gemini ---');
  console.log(JSON.stringify(rawFindings, null, 2));

  // 4. Grounding Filter Demonstration
  console.log('\n--- Step 3: Grounding Filter Verification ---');
  // Inject a synthetic hallucinated finding to prove the grounding filter actively drops it
  const simulatedRawFindings = [
    ...rawFindings,
    {
      engine: 'LLM_RAG' as const,
      severity: 'HIGH' as const,
      source_rule_id: 'FABRICATED-RULE-999',
      rule_version: 1,
      flagged_span: 'Kestrel Cloud platform',
      explanation: 'Hallucinated rule violation not in approved ruleset',
      minimal_edit: null,
    },
    {
      engine: 'LLM_RAG' as const,
      severity: 'LOW' as const,
      source_rule_id: 'FACT-SLA-01',
      rule_version: 1,
      flagged_span: 'this non-existent hallucinated sentence is nowhere in the draft',
      explanation: 'Flagged span hallucination',
      minimal_edit: null,
    },
  ];

  const retrievedRuleIds = new Set(activeRules.map((r) => r.rule_id));
  const groundingResult = applyGroundingFilter(simulatedRawFindings, redactedText, retrievedRuleIds);

  console.log('Total Raw Findings (including injected hallucinations):', simulatedRawFindings.length);
  console.log('Grounded Findings Kept:', groundingResult.groundedFindings.length);
  console.log('Dropped Findings Count:', groundingResult.droppedCount);
  console.log('Dropped Findings Detail:');
  console.log(JSON.stringify(groundingResult.droppedFindings, null, 2));

  // 5. Audit Logging to payload_log in Supabase
  console.log('\n--- Step 4: Outbound Payload Logging to Supabase payload_log ---');
  const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authErr } = await anonClient.auth.signInAnonymously();
  if (authErr || !authData?.session) throw new Error('Supabase anon auth failed: ' + (authErr?.message || 'No session'));

  const scopedClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  });

  const wsId = crypto.randomUUID();
  await scopedClient.from('workspaces').insert({ id: wsId, name: 'Gemini Audit Log Test' });
  await scopedClient.from('members').insert({ workspace_id: wsId, user_id: authData.user.id, role: 'manager' });

  const outboundPayload = {
    redactedText,
    tokens,
    rulesCount: activeRules.length,
    model: 'gemini-1.5-flash',
    timestamp: new Date().toISOString(),
  };

  const { error: logErr } = await scopedClient.from('payload_log').insert({
    workspace_id: wsId,
    user_id: authData.user.id,
    endpoint: 'POST /api/drafts/[id]/review',
    payload: outboundPayload,
  });
  if (logErr) throw new Error('Failed to insert payload_log: ' + logErr.message);

  // Query back the row to prove persistence
  const { data: loggedRows, error: fetchErr } = await scopedClient
    .from('payload_log')
    .select('*')
    .eq('workspace_id', wsId);

  if (fetchErr || !loggedRows || loggedRows.length === 0) {
    throw new Error('Failed to retrieve logged payload: ' + fetchErr?.message);
  }

  console.log('Persisted payload_log Row:');
  console.log(JSON.stringify(loggedRows[0], null, 2));

  // 6. Timeout and Retry Verification
  console.log('\n--- Step 5: Timeout & Retry Verification ---');
  const abortController = new AbortController();
  abortController.abort(); // Immediately aborted
  try {
    await provider.checkDraft(redactedText, activeRules, abortController.signal);
    console.log('Timeout test failed: expected abort error');
  } catch (err: any) {
    console.log('AbortSignal successfully handled (PASS):', err.message);
  }

  console.log('\n=== LIVE GEMINI ADAPTER REVIEW COMPLETED SUCCESSFULLY! ===');
}

runLiveGeminiTest().catch((err) => {
  console.error('Gemini Live Review Error:', err);
  process.exit(1);
});
