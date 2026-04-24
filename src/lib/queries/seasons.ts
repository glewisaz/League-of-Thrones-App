import { createAnonServerClient } from '@/lib/supabase/server';

/**
 * Fetch the current active season configuration.
 *
 * Exactly one row in the seasons table should have is_active=true at any
 * given time. Returns null if no active season is configured, so callers
 * must provide a sensible fallback (typically current calendar year / 200
 * auction cap) rather than crashing on a fresh deployment.
 */
export async function getActiveSeason() {
  const supabase = createAnonServerClient();
  const { data } = await supabase
    .from('seasons')
    .select('year, auction_cap, faab_cap')
    .eq('is_active', true)
    .single();
  return data as { year: number; auction_cap: number; faab_cap: number } | null;
}
