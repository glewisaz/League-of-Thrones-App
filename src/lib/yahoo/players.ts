import { yahooFetch } from './client';
import { findInArray, iterateYahooObject } from './parse';
import { createAdminClient } from '@/lib/supabase/admin';

export type YahooPlayer = {
  playerKey: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
};

/** Pull the Yahoo league key from the singleton yahoo_auth row. */
export async function getLeagueKey(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('yahoo_auth')
    .select('league_key')
    .eq('id', 1)
    .maybeSingle();
  return (data as { league_key: string | null } | null)?.league_key ?? null;
}

/**
 * Fetch players from the Yahoo league player list filtered by status.
 *
 * status='FA' — unrostered free agents, sorted by average rank (AR)
 * status='R'  — rookies (Yahoo's rookie designation), sorted by AR
 *
 * Returns an empty array instead of throwing so callers can render a
 * graceful empty state if Yahoo is unreachable or tokens are expired.
 */
export async function fetchYahooPlayers(
  leagueKey: string,
  status: 'FA' | 'R',
  count = 10,
): Promise<YahooPlayer[]> {
  try {
    const response = (await yahooFetch(
      `/league/${leagueKey}/players;status=${status};sort=AR;count=${count}`,
    )) as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueArr = (response?.fantasy_content as any)?.league as unknown[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playersObj = (leagueArr?.[1] as any)?.players as Record<string, unknown> | undefined;
    if (!playersObj) return [];

    const players: YahooPlayer[] = [];
    for (const item of iterateYahooObject(playersObj)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerArr = (item as any)?.player as unknown[] | undefined;
      if (!Array.isArray(playerArr)) continue;

      const info = playerArr[0] as unknown[];
      const playerKey = findInArray(info, 'player_key') as string | undefined;
      if (!playerKey) continue;

      const nameRaw = findInArray(info, 'name');
      const name =
        typeof nameRaw === 'string'
          ? nameRaw
          : (nameRaw as { full?: string } | undefined)?.full ?? null;
      if (!name) continue;

      players.push({
        playerKey,
        name,
        position: (findInArray(info, 'display_position') as string | undefined) ?? null,
        nflTeam: (findInArray(info, 'editorial_team_abbr') as string | undefined) ?? null,
      });
    }
    return players;
  } catch (err) {
    console.error(`[fetchYahooPlayers] status=${status}:`, err);
    return [];
  }
}

/** Build a Yahoo Sports player profile URL from a player key like "nfl.p.12345". */
export function yahooPlayerUrl(playerKey: string): string {
  const numericId = playerKey.replace(/^nfl\.p\./, '');
  return `https://sports.yahoo.com/nfl/players/${numericId}/`;
}
