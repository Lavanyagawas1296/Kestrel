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
  {
    rule_id: 'FACT-SLA-01',
    type: 'FACT' as const,
    owner: 'Engineering Operations',
    effective_date: '2024-01-01',
    version: 1,
    rule_text:
      'Enterprise SLA uptime guarantee is 99.9% (three nines), not 99.99% or 100%. Promotional and customer-facing copy must state 99.9% availability and must never claim zero-downtime or four-nines.',
    source_name: 'Infrastructure Master Service Level Agreement Sec. 4.1',
    source_url: 'https://brand.kestrel.internal/legal/sla',
    origin: 'public_sample' as const,
    status: 'ACTIVE' as const,
  },
];
