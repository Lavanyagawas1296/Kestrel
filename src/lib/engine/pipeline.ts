import { ingestContent } from './ingest';
import { redactDraftContent, restoreTokens, type RedactionTokenMap } from './redact';
import { runDeterministicChecks, type DeterministicFinding } from './deterministic';
import { applyGroundingFilter } from './grounding';
import { getLLMProvider, type RuleContext, type LLMProvider } from './llm-adapter';
import type { AllowedMimeType } from '../validation/upload';

export interface ReviewPipelineInput {
  rawContent: string | Buffer;
  mimeType?: AllowedMimeType;
  workspaceId: string;
  activeRules: RuleContext[];
  codenames?: string[];
  llmProvider?: LLMProvider;
  timeoutMs?: number;
}

export interface FailedCheckStatus {
  engine: 'DETERMINISTIC' | 'LLM_RAG';
  error: string;
}

export interface ReviewPipelineOutput {
  ingestedText: string;
  redactedText: string;
  tokens: RedactionTokenMap[];
  findings: DeterministicFinding[];
  failedChecks: FailedCheckStatus[];
  emptyKb: boolean;
  droppedLlmFindingsCount: number;
}

export async function runReviewPipeline(
  input: ReviewPipelineInput
): Promise<ReviewPipelineOutput> {
  const failedChecks: FailedCheckStatus[] = [];

  // 1. Ingestion
  const ingestionResult = await ingestContent(
    input.rawContent,
    input.mimeType || 'text/plain'
  );
  const ingestedText = ingestionResult.text;

  // 2. Check if KB is empty
  if (!input.activeRules || input.activeRules.length === 0) {
    return {
      ingestedText,
      redactedText: ingestedText,
      tokens: [],
      findings: [],
      failedChecks: [],
      emptyKb: true,
      droppedLlmFindingsCount: 0,
    };
  }

  // 3. Redaction
  const { redactedText, tokens } = redactDraftContent(
    ingestedText,
    input.codenames || []
  );

  // 4. Deterministic checks
  const deterministicFindings = runDeterministicChecks(ingestedText, {
    dominantHexColors: ingestionResult.metadata?.dominantHexColors,
  });

  // 5. LLM Retrieval Checks (with timeout & grounding filter)
  const provider = input.llmProvider || getLLMProvider();
  let llmFindings: DeterministicFinding[] = [];
  let droppedCount = 0;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 25_000);

    const rawLlmFindings = await provider.checkDraft(
      redactedText,
      input.activeRules,
      controller.signal
    );
    clearTimeout(timeout);

    // Apply Grounding Filter: verify rule ID is in retrieved set & span is in draft
    const retrievedRuleIds = new Set(input.activeRules.map((r) => r.rule_id));
    const grounding = applyGroundingFilter(
      rawLlmFindings,
      redactedText,
      retrievedRuleIds
    );

    droppedCount = grounding.droppedCount;

    // Restore any redaction tokens inside flagged spans
    llmFindings = grounding.groundedFindings.map((f) => ({
      ...f,
      flagged_span: restoreTokens(f.flagged_span, tokens),
      minimal_edit: f.minimal_edit ? restoreTokens(f.minimal_edit, tokens) : null,
    }));
  } catch (err: any) {
    console.error('[ReviewPipeline] LLM check failed:', err);
    failedChecks.push({
      engine: 'LLM_RAG',
      error: err.name === 'AbortError' ? 'LLM evaluation timed out' : err.message || 'LLM check failed',
    });
  }

  // Combine findings
  const combinedFindings = [...deterministicFindings, ...llmFindings];

  return {
    ingestedText,
    redactedText,
    tokens,
    findings: combinedFindings,
    failedChecks,
    emptyKb: false,
    droppedLlmFindingsCount: droppedCount,
  };
}
