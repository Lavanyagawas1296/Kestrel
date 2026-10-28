import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { getSupabaseCredentials } from './config';

/**
 * Creates a browser-compatible Supabase client for client components.
 */
export function createClient() {
  const { url, key } = getSupabaseCredentials();
  return createBrowserClient<Database>(url, key);
}
