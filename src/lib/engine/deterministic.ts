import type { FindingEngine, FindingSeverity } from '../supabase/database.types';

export interface DeterministicFinding {
  engine: FindingEngine;
  severity: FindingSeverity;
  source_rule_id: string;
  rule_version: number;
  flagged_span: string;
  explanation: string;
  minimal_edit?: string | null;
}

/**
 * Calculates relative luminance according to WCAG 2.1 specifications.
 */
export function calculateRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6) return 0;

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const rLin = toLinear(r);
  const gLin = toLinear(g);
  const bLin = toLinear(b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates contrast ratio between two hex colors.
 */
export function calculateContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = calculateRelativeLuminance(fgHex);
  const l2 = calculateRelativeLuminance(bgHex);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (brighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Deterministic checks against active KB rules.
 */
export function runDeterministicChecks(
  content: string,
  options?: {
    dominantHexColors?: string[];
  }
): DeterministicFinding[] {
  const findings: DeterministicFinding[] = [];

  if (!content) return findings;

  // 1. Check for Slack brand guidelines violations (Rule: SLACK-BRAND-01)
  const slackPatterns: { regex: RegExp; edit: string; explanation: string }[] = [
    {
      regex: /Happy Slacking!/gi,
      edit: 'Best regards,',
      explanation: 'The sign-off "Happy Slacking!" is strictly banned under Slack brand guidelines.',
    },
    {
      regex: /\b(?:I(?:'ll| will)\s+slack\s+you)\b/gi,
      edit: "I'll message you on Slack",
      explanation: '"Slack" must never be used as a verb.',
    },
    {
      regex: /\b(?:slack\s+me)\b/gi,
      edit: 'message me on Slack',
      explanation: '"Slack" must never be used as a verb.',
    },
    {
      regex: /\b(?:send(?:ing)?\s+(?:a|the)\s+slack)\b/gi,
      edit: 'send a Slack message',
      explanation: '"Slack" must never be used as a common noun.',
    },
  ];

  for (const { regex, edit, explanation } of slackPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      findings.push({
        engine: 'DETERMINISTIC',
        severity: 'HIGH',
        source_rule_id: 'SLACK-BRAND-01',
        rule_version: 1,
        flagged_span: match[0],
        explanation,
        minimal_edit: edit,
      });
    }
  }

  // 2. Check for missing Alt Text in images (Rule: WCAG-2.1-1.1.1)
  // Markdown images: ![alt](url)
  const mdImgRegex = /!\[(.*?)\]\((.*?)\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdImgRegex.exec(content)) !== null) {
    const altText = mdMatch[1].trim();
    if (!altText) {
      findings.push({
        engine: 'DETERMINISTIC',
        severity: 'HIGH',
        source_rule_id: 'WCAG-2.1-1.1.1',
        rule_version: 1,
        flagged_span: mdMatch[0],
        explanation: 'Image is missing alternative text (empty alt attribute).',
        minimal_edit: `![Descriptive alternative text](${mdMatch[2]})`,
      });
    }
  }

  // HTML images: <img ...>
  const htmlImgRegex = /<img\b([^>]*?)>/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlImgRegex.exec(content)) !== null) {
    const attrs = htmlMatch[1];
    const altMatch = /alt=["'](.*?)["']/i.exec(attrs);
    if (!altMatch || !altMatch[1].trim()) {
      findings.push({
        engine: 'DETERMINISTIC',
        severity: 'HIGH',
        source_rule_id: 'WCAG-2.1-1.1.1',
        rule_version: 1,
        flagged_span: htmlMatch[0],
        explanation: 'HTML <img> tag is missing required non-empty alt text.',
        minimal_edit: htmlMatch[0].replace(/<img\b/i, '<img alt="Descriptive text"'),
      });
    }
  }

  // 3. Check for low contrast pairs in content (Rule: WCAG-2.1-1.4.3)
  // Matches patterns like "color: #AAA on #FFF" or "foreground #AAA background #FFF"
  const contrastPattern = /(?:foreground|fg|color)?\s*(#[0-9a-fA-F]{6})\s*(?:on|against|background|bg)\s*(#[0-9a-fA-F]{6})/gi;
  let contrastMatch: RegExpExecArray | null;
  while ((contrastMatch = contrastPattern.exec(content)) !== null) {
    const fg = contrastMatch[1];
    const bg = contrastMatch[2];
    const ratio = calculateContrastRatio(fg, bg);

    if (ratio < 4.5) {
      findings.push({
        engine: 'DETERMINISTIC',
        severity: 'HIGH',
        source_rule_id: 'WCAG-2.1-1.4.3',
        rule_version: 1,
        flagged_span: contrastMatch[0],
        explanation: `Contrast ratio between ${fg} and ${bg} is approximately ${ratio}:1, which is below the WCAG 2.1 AA minimum 4.5:1 for normal text (labelled approximate).`,
        minimal_edit: null,
      });
    }
  }

  return findings;
}
