/**
 * Centralized Supabase configuration resolver.
 * Ensures that if the environment variables point to an older/disabled project
 * or are missing, Kestrel reliably connects to the active, migrated Supabase project.
 */

export const DEFAULT_SUPABASE_URL = 'https://nmocutiarvpowulxuwfi.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_rXroWKHntHIU3k1v6mCDVA_Q0QjgnqB';

export function getSupabaseCredentials() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  // If unset, or pointing to the inactive/unseeded project qboyhfvxnwtszazcymgy
  if (!url || url.includes('qboyhfvxnwtszazcymgy') || !key) {
    url = DEFAULT_SUPABASE_URL;
    key = DEFAULT_SUPABASE_ANON_KEY;
  }

  return { url, key };
}
