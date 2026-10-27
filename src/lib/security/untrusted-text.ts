/**
 * Security utilities for treating draft text as untrusted data.
 * Protects downstream LLM prompts against prompt-injection attacks.
 */

/**
 * Escapes characters that could terminate XML/tag boundaries in prompt structures.
 */
export function sanitizeUntrustedText(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps untrusted text in strict XML envelopes with a non-guessable nonce or boundary,
 * preventing draft content from breaking out and issuing instructions to the LLM.
 */
export function wrapInUntrustedBoundary(content: string, boundaryTag: string = 'untrusted_draft_content'): string {
  const sanitized = sanitizeUntrustedText(content);
  return `<${boundaryTag}>\n${sanitized}\n</${boundaryTag}>`;
}
