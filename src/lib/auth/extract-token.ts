/**
 * Helper to extract Supabase anonymous / user JWT from incoming Next.js requests.
 * Checks Authorization header, Cookie header, and query string.
 */
export function extractToken(req: Request): string | undefined {
  // 1. Authorization header: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Cookie header: kestrel_session_token=<token>
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const c of cookies) {
      if (c.startsWith('kestrel_session_token=')) {
        return decodeURIComponent(c.substring('kestrel_session_token='.length));
      }
    }
  }

  // 3. Query string token parameter
  try {
    const url = new URL(req.url);
    const qToken = url.searchParams.get('token');
    if (qToken) return qToken;
  } catch {
    // Ignore URL parse errors
  }

  return undefined;
}
