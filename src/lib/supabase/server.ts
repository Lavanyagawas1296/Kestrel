import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from './database.types';

export interface CookieHandler {
  getAll: () => { name: string; value: string }[] | Promise<{ name: string; value: string }[]>;
  setAll?: (
    cookies: {
      name: string;
      value: string;
      options: CookieOptions;
    }[]
  ) => void | Promise<void>;
}

/**
 * Creates a server-side Supabase client for Server Components, Server Actions, or Route Handlers.
 * Respects RLS and the calling user's session token.
 */
export function createServerSupabaseClient(cookieHandler?: CookieHandler) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase public environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined.'
    );
  }

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      async getAll() {
        if (!cookieHandler) return [];
        return await cookieHandler.getAll();
      },
      async setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[]
      ) {
        if (!cookieHandler?.setAll) return;
        await cookieHandler.setAll(cookiesToSet);
      },
    },
  });
}
