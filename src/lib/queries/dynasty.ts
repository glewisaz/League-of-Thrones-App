import { createAnonServerClient } from '@/lib/supabase/server';

export type DynastyFreeAgent = {
  rank: number;
  player_name: string;
  position: string;
  yahoo_player_id: string | null;
};

export type FreeAgentsByPosition = {
  QB: DynastyFreeAgent[];
  RB: DynastyFreeAgent[];
  WR: DynastyFreeAgent[];
  TE: DynastyFreeAgent[];
};

const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export async function getDynastyFreeAgents(perPosition = 5): Promise<FreeAgentsByPosition> {
  const supabase = createAnonServerClient();

  const [{ data: rankings }, { data: rostered }] = await Promise.all([
    supabase
      .from('dynasty_rankings')
      .select('rank, player_name, position, yahoo_player_id')
      .order('rank'),
    supabase
      .from('contracts')
      .select('player_id')
      .eq('status', 'active')
      .not('player_id', 'is', null),
  ]);

  const rosteredIds = new Set((rostered ?? []).map((r) => r.player_id as string));

  const unrostered = (rankings ?? []).filter(
    (r) => !r.yahoo_player_id || !rosteredIds.has(r.yahoo_player_id),
  ) as DynastyFreeAgent[];

  const result = {} as FreeAgentsByPosition;
  for (const pos of POSITIONS) {
    result[pos] = unrostered.filter((r) => r.position === pos).slice(0, perPosition);
  }
  return result;
}
