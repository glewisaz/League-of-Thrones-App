import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS — full database access.
 *
 * SERVER-ONLY. NEVER import this from a client component or expose the
 * service role key in any client bundle. Use it from:
 *   - Vercel cron handlers (route handlers under app/api/cron/)
 *   - Server actions for commissioner writes
 *   - Yahoo OAuth callback / sync jobs
 *
 * Throws at construction time if env vars are missing so misconfigurations
 * fail loud, not silent.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY ' +
        'environment variables.',
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
