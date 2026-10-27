import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Server-only Supabase admin client utilizing the Service Role Key.
 * Bypasses RLS for trusted operational tasks (e.g. system migrations, background workers).
 *
 * SECURITY: Never import or execute this file in client bundles or public API surfaces!
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('FATAL SECURITY VIOLATION: Admin Supabase client cannot be instantiated in the browser!');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase admin environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined.'
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
