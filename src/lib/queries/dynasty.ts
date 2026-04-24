import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabase = createAdminClient();

  const [{ data: rankings }, { data: rosteredContracts }, sleeperResp] = await Promise.all([
    supabase
      .from('dynasty_rankings')
      .select('rank, player_name, position, yahoo_player_id')
      .order('rank'),
    supabase
      .from('contracts')
      .select('player_id, players!inner(name)')
      .eq('status', 'active')
      .not('player_id', 'is', null),
    fetch('https://api.sleeper.app/v1/players/nfl', { next: { revalidate: 86400 } }),
  ]);

  const rosteredNames = new Set(
    (rosteredContracts ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => (c.players?.name as string | undefined)?.toLowerCase())
      .filter(Boolean) as string[],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPlayers = sleeperResp.ok ? ((await sleeperResp.json()) as Record<string, any>) : {};
  const rookieNames = new Set(
    Object.values(allPlayers)
      .filter((p) => p.active && p.years_exp === 0 && p.team)
      .map((p) => `${p.first_name} ${p.last_name}`.toLowerCase()),
  );

  const unrostered = (rankings ?? [])
    .filter((r) => !rosteredNames.has(r.player_name.toLowerCase()))
    .filter((r) => !rookieNames.has(r.player_name.toLowerCase())) as DynastyFreeAgent[];

  const result = {} as FreeAgentsByPosition;
  for (const pos of POSITIONS) {
    result[pos] = unrostered.filter((r) => r.position === pos).slice(0, perPosition);
  }
  return result;
}
