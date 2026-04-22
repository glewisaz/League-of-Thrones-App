import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side anon client for reading public data in server components,
 * server actions, route handlers, and ISR pages. No cookies, no session.
 *
 * RLS-bound to the anon role. Cannot read yahoo_auth.
 *
 * For commissioner writes, use createAdminClient() from ./admin.ts instead.
 */
export function createAnonServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
