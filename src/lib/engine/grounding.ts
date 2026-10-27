import type { FindingEngine, FindingSeverity } from '../supabase/database.types';

export interface RawLlmFinding {
  engine: FindingEngine;
  severity: FindingSeverity;
  source_rule_id: string;
  rule_version: number;
  flagged_span: string;
  explanation: string;
  minimal_edit?: string | null;
}

export interface GroundingFilterResult {
  groundedFindings: RawLlmFinding[];
  droppedCount: number;
  droppedReasons: {
    rule_id: string;
    span: string;
    reason: 'RULE_NOT_IN_RETRIEVED_SET' | 'SPAN_NOT_IN_DRAFT';
  }[];
}

/**
 * Validates that every finding emitted by an LLM is strictly grounded:
 * 1. The source_rule_id MUST exist in the retrieved rule set for the draft.
 * 2. The flagged_span MUST be an exact substring of the draft content.
 */
export function applyGroundingFilter(
  findings: RawLlmFinding[],
  draftContent: string,
  retrievedRuleIds: Set<string>
): GroundingFilterResult {
  const groundedFindings: RawLlmFinding[] = [];
  const droppedReasons: GroundingFilterResult['droppedReasons'] = [];

  for (const finding of findings) {
    // 1. Verify source rule was in the retrieved set
    if (!retrievedRuleIds.has(finding.source_rule_id)) {
      droppedReasons.push({
        rule_id: finding.source_rule_id,
        span: finding.flagged_span,
        reason: 'RULE_NOT_IN_RETRIEVED_SET',
      });
      continue;
    }

    // 2. Verify flagged_span is an exact substring of the draft
    if (!draftContent.includes(finding.flagged_span)) {
      droppedReasons.push({
        rule_id: finding.source_rule_id,
        span: finding.flagged_span,
        reason: 'SPAN_NOT_IN_DRAFT',
      });
      continue;
    }

    groundedFindings.push(finding);
  }

  if (droppedReasons.length > 0) {
    console.warn(
      `[GroundingFilter] Dropped ${droppedReasons.length} ungrounded findings:`,
      droppedReasons
    );
  }

  return {
    groundedFindings,
    droppedCount: droppedReasons.length,
    droppedReasons,
  };
}
