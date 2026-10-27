export interface RedactionTokenMap {
  token: string;
  original: string;
  type: 'email' | 'phone' | 'codename';
}

export interface RedactionResult {
  redactedText: string;
  tokens: RedactionTokenMap[];
}

// Regex patterns for sensitive entities
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/**
 * Redacts confidential data (emails, phone numbers, and workspace-defined codenames).
 * Produces deterministic tokens and a reverse mapping for restoring flagged spans.
 */
export function redactDraftContent(
  text: string,
  codenames: string[] = []
): RedactionResult {
  if (!text) {
    return { redactedText: '', tokens: [] };
  }

  const tokens: RedactionTokenMap[] = [];
  let redacted = text;

  // 1. Redact workspace codenames first (to prevent partial matches with emails/phones)
  codenames
    .filter(Boolean)
    .sort((a, b) => b.length - a.length) // match longest phrases first
    .forEach((codename, index) => {
      const token = `[REDACTED_CODENAME_${index + 1}]`;
      const escaped = codename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

      let matched = false;
      redacted = redacted.replace(regex, (match) => {
        matched = true;
        return token;
      });

      if (matched) {
        tokens.push({
          token,
          original: codename,
          type: 'codename',
        });
      }
    });

  // 2. Redact emails
  let emailCount = 0;
  const emailMap = new Map<string, string>();
  redacted = redacted.replace(EMAIL_REGEX, (match) => {
    let token = emailMap.get(match.toLowerCase());
    if (!token) {
      emailCount += 1;
      token = `[REDACTED_EMAIL_${emailCount}]`;
      emailMap.set(match.toLowerCase(), token);
      tokens.push({
        token,
        original: match,
        type: 'email',
      });
    }
    return token;
  });

  // 3. Redact phone numbers
  let phoneCount = 0;
  const phoneMap = new Map<string, string>();
  redacted = redacted.replace(PHONE_REGEX, (match) => {
    // Only redact if string contains at least 7 digits to avoid matching small numbers
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7) {
      return match;
    }
    let token = phoneMap.get(match);
    if (!token) {
      phoneCount += 1;
      token = `[REDACTED_PHONE_${phoneCount}]`;
      phoneMap.set(match, token);
      tokens.push({
        token,
        original: match,
        type: 'phone',
      });
    }
    return token;
  });

  return {
    redactedText: redacted,
    tokens,
  };
}

/**
 * Restores any redaction tokens inside an LLM-flagged span back to original text.
 */
export function restoreTokens(span: string, tokens: RedactionTokenMap[]): string {
  let restored = span;
  for (const item of tokens) {
    restored = restored.split(item.token).join(item.original);
  }
  return restored;
}
