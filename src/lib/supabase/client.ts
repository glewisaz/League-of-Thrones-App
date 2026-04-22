import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for use in client components ('use client').
 * Uses the anon key — read-only access via RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
