import { describe, it, expect } from 'vitest';
import { redactDraftContent, restoreTokens } from '../src/lib/engine/redact';
import {
  runDeterministicChecks,
  calculateContrastRatio,
  calculateRelativeLuminance,
} from '../src/lib/engine/deterministic';
import { applyGroundingFilter } from '../src/lib/engine/grounding';
import { runReviewPipeline } from '../src/lib/engine/pipeline';
import type { LLMProvider, RuleContext } from '../src/lib/engine/llm-adapter';
import type { RawLlmFinding } from '../src/lib/engine/grounding';

describe('Review Engine & Grounding Test Suite', () => {
  describe('1. Redaction & Token Round-Trip', () => {
    it('redacts emails, phones, and codenames into deterministic tokens', () => {
      const input =
        'Contact Alice at alice@acme-corp.test or call (555) 019-2834 regarding Project Chimera.';
      const codenames = ['Project Chimera'];

      const { redactedText, tokens } = redactDraftContent(input, codenames);

      expect(redactedText).not.toContain('alice@acme-corp.test');
      expect(redactedText).not.toContain('(555) 019-2834');
      expect(redactedText).not.toContain('Project Chimera');

      expect(redactedText).toContain('[REDACTED_CODENAME_1]');
      expect(redactedText).toContain('[REDACTED_EMAIL_1]');
      expect(redactedText).toContain('[REDACTED_PHONE_1]');

      expect(tokens.length).toBe(3);
    });

    it('faithfully restores redacted tokens back to original spans', () => {
      const input = 'Send briefing to security@corp.test today.';
      const { tokens } = redactDraftContent(input);

      const flaggedByLlm = '[REDACTED_EMAIL_1]';
      const restored = restoreTokens(flaggedByLlm, tokens);

      expect(restored).toBe('security@corp.test');
    });
  });

  describe('2. Deterministic Rule Checks', () => {
    it('detects Slack brand guideline violations (SLACK-BRAND-01)', () => {
      const text = "Please slack me the final slides. Happy Slacking!";
      const findings = runDeterministicChecks(text);

      expect(findings.length).toBe(2);

      const bannedSignOff = findings.find((f) => f.flagged_span === 'Happy Slacking!');
      expect(bannedSignOff).toBeDefined();
      expect(bannedSignOff?.source_rule_id).toBe('SLACK-BRAND-01');
      expect(bannedSignOff?.minimal_edit).toBe('Best regards,');

      const verbMisuse = findings.find((f) => f.flagged_span.toLowerCase() === 'slack me');
      expect(verbMisuse).toBeDefined();
      expect(verbMisuse?.source_rule_id).toBe('SLACK-BRAND-01');
    });

    it('detects missing alt text in markdown and HTML (WCAG-2.1-1.1.1)', () => {
      const mdMissing = 'Check this chart: ![](https://assets.test/chart.png)';
      const findingsMd = runDeterministicChecks(mdMissing);
      expect(findingsMd.length).toBe(1);
      expect(findingsMd[0].source_rule_id).toBe('WCAG-2.1-1.1.1');

      const htmlMissing = '<p>Our team</p><img src="team.png">';
      const findingsHtml = runDeterministicChecks(htmlMissing);
      expect(findingsHtml.length).toBe(1);
      expect(findingsHtml[0].source_rule_id).toBe('WCAG-2.1-1.1.1');
    });

    it('calculates WCAG contrast ratio and flags low-contrast pairs (WCAG-2.1-1.4.3)', () => {
      // Contrast of #999999 on #FFFFFF is ~2.84:1 (< 4.5:1)
      const ratio = calculateContrastRatio('#999999', '#FFFFFF');
      expect(ratio).toBeLessThan(4.5);

      const text = 'Styled with color #999999 on #FFFFFF background.';
      const findings = runDeterministicChecks(text);
      expect(findings.length).toBe(1);
      expect(findings[0].source_rule_id).toBe('WCAG-2.1-1.4.3');
      expect(findings[0].explanation).toContain('labelled approximate');
    });
  });

  describe('3. Grounding Filter', () => {
    const draftText = 'Our company was founded in 2020 and provides reliable uptime.';
    const retrievedRuleIds = new Set(['FACT-FOUNDED-01', 'FACT-SLA-01']);

    it('drops findings whose source_rule_id is not in the retrieved set', () => {
      const fakeRuleFinding: RawLlmFinding = {
        engine: 'LLM_RAG',
        severity: 'HIGH',
        source_rule_id: 'FABRICATED-RULE-999', // not in retrieved set!
        rule_version: 1,
        flagged_span: 'reliable uptime',
        explanation: 'Hallucinated rule citation',
      };

      const result = applyGroundingFilter([fakeRuleFinding], draftText, retrievedRuleIds);
      expect(result.groundedFindings.length).toBe(0);
      expect(result.droppedCount).toBe(1);
      expect(result.droppedReasons[0].reason).toBe('RULE_NOT_IN_RETRIEVED_SET');
    });

    it('drops findings whose flagged_span is not an exact substring of the draft', () => {
      const halluncinatedSpanFinding: RawLlmFinding = {
        engine: 'LLM_RAG',
        severity: 'MEDIUM',
        source_rule_id: 'FACT-SLA-01',
        rule_version: 1,
        flagged_span: 'guaranteed 100% 24/7 uptime without outages', // not in draft!
        explanation: 'Hallucinated text span',
      };

      const result = applyGroundingFilter([halluncinatedSpanFinding], draftText, retrievedRuleIds);
      expect(result.groundedFindings.length).toBe(0);
      expect(result.droppedCount).toBe(1);
      expect(result.droppedReasons[0].reason).toBe('SPAN_NOT_IN_DRAFT');
    });

    it('preserves valid, strictly grounded findings', () => {
      const groundedFinding: RawLlmFinding = {
        engine: 'LLM_RAG',
        severity: 'LOW',
        source_rule_id: 'FACT-FOUNDED-01',
        rule_version: 1,
        flagged_span: 'founded in 2020',
        explanation: 'Valid verified span',
      };

      const result = applyGroundingFilter([groundedFinding], draftText, retrievedRuleIds);
      expect(result.groundedFindings.length).toBe(1);
      expect(result.droppedCount).toBe(0);
    });
  });

  describe('4. Mocked LLM Adapter & Timeout/Failure Handling', () => {
    it('returns empty findings when KB is empty without fabricating findings', async () => {
      const result = await runReviewPipeline({
        rawContent: 'Draft text',
        workspaceId: '11111111-1111-1111-1111-111111111111',
        activeRules: [],
      });

      expect(result.emptyKb).toBe(true);
      expect(result.findings.length).toBe(0);
    });

    it('handles LLM error with visible failed-check status instead of silent pass', async () => {
      const failingProvider: LLMProvider = {
        name: 'FailingLLM',
        checkDraft: async () => {
          throw new Error('LLM upstream quota exceeded (503)');
        },
      };

      const activeRules: RuleContext[] = [
        {
          rule_id: 'SLACK-BRAND-01',
          version: 1,
          type: 'TERM',
          rule_text: 'Do not use slack as verb',
        },
      ];

      const result = await runReviewPipeline({
        rawContent: 'Hello world draft content.',
        workspaceId: '11111111-1111-1111-1111-111111111111',
        activeRules,
        llmProvider: failingProvider,
      });

      // Must record visible failed check status
      expect(result.failedChecks.length).toBe(1);
      expect(result.failedChecks[0].engine).toBe('LLM_RAG');
      expect(result.failedChecks[0].error).toContain('quota exceeded');
    });
  });
});
