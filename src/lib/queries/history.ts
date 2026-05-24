import { createAnonServerClient } from '@/lib/supabase/server';

export type SeasonStanding = {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  seed: number | null;
  final_placement: number | null;
  yahoo_outcome: string | null;
};

export type FranchiseAllTime = {
  seasons_played: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  championships: number;
  runner_ups: number;
};

export type HeadToHeadRow = {
  opponent_id: string;
  opponent_owner: string;
  opponent_slug: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
};

export async function getFranchiseStandings(teamId: string): Promise<SeasonStanding[]> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('standings')
    .select('season, wins, losses, ties, points_for, points_against, seed, final_placement, yahoo_outcome')
    .eq('team_id', teamId)
    .order('season', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      season: row.season as number,
      wins: row.wins as number,
      losses: row.losses as number,
      ties: row.ties as number,
      points_for: Number(row.points_for),
      points_against: Number(row.points_against),
      seed: (row.seed as number | null) ?? null,
      final_placement: (row.final_placement as number | null) ?? null,
      yahoo_outcome: (row.yahoo_outcome as string | null) ?? null,
    };
  });
}

export async function getFranchiseChampionships(teamId: string): Promise<{
  championship_seasons: number[];
  runner_up_seasons: number[];
}> {
  const supabase = createAnonServerClient();
  const [{ data: champs }, { data: runners }] = await Promise.all([
    supabase.from('champions').select('season').eq('champion_team_id', teamId),
    supabase.from('champions').select('season').eq('runner_up_team_id', teamId),
  ]);
  return {
    championship_seasons: ((champs ?? []) as { season: number }[]).map((c) => c.season).sort(),
    runner_up_seasons: ((runners ?? []) as { season: number }[]).map((c) => c.season).sort(),
  };
}

export function summarizeAllTime(
  rows: SeasonStanding[],
  championships: number,
  runner_ups: number,
): FranchiseAllTime {
  let wins = 0,
    losses = 0,
    ties = 0,
    pf = 0,
    pa = 0;
  for (const r of rows) {
    wins += r.wins;
    losses += r.losses;
    ties += r.ties;
    pf += r.points_for;
    pa += r.points_against;
  }
  return {
    seasons_played: rows.length,
    wins,
    losses,
    ties,
    points_for: pf,
    points_against: pa,
    championships,
    runner_ups,
  };
}

/**
 * All-time head-to-head record for a team against every opponent it has
 * ever played, using the matchups_by_team view.
 */
export async function getHeadToHeadAllTime(teamId: string): Promise<HeadToHeadRow[]> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('matchups_by_team')
    .select('opponent_id, points_for, points_against, result')
    .eq('team_id', teamId);
  if (error) throw error;

  const rows = (data ?? []) as {
    opponent_id: string;
    points_for: number;
    points_against: number;
    result: 'W' | 'L' | 'T';
  }[];

  // Aggregate in JS — Supabase doesn't expose group-by directly.
  const buckets = new Map<string, HeadToHeadRow>();
  for (const r of rows) {
    let b = buckets.get(r.opponent_id);
    if (!b) {
      b = {
        opponent_id: r.opponent_id,
        opponent_owner: '',
        opponent_slug: '',
        games: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points_for: 0,
        points_against: 0,
      };
      buckets.set(r.opponent_id, b);
    }
    b.games++;
    b.points_for += Number(r.points_for);
    b.points_against += Number(r.points_against);
    if (r.result === 'W') b.wins++;
    else if (r.result === 'L') b.losses++;
    else b.ties++;
  }

  const opponentIds = Array.from(buckets.keys());
  if (opponentIds.length === 0) return [];

  const { data: opponents } = await supabase
    .from('teams')
    .select('id, owner_name, slug')
    .in('id', opponentIds);
  for (const o of (opponents ?? []) as { id: string; owner_name: string; slug: string }[]) {
    const b = buckets.get(o.id);
    if (b) {
      b.opponent_owner = o.owner_name;
      b.opponent_slug = o.slug;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => b.games - a.games);
}
