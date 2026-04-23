import { createAnonServerClient } from '@/lib/supabase/server';

export async function getActiveSeason() {
  const supabase = createAnonServerClient();
  const { data } = await supabase
    .from('seasons')
    .select('year, auction_cap, faab_cap')
    .eq('is_active', true)
    .single();
  return data as { year: number; auction_cap: number; faab_cap: number } | null;
}
