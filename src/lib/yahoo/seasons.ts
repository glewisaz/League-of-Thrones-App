import { yahooFetch } from './client';
import { findInArray, iterateYahooObject } from './parse';

/**
 * Yahoo's NFL game_key changes every season — they're effectively the version
 * of the game (rules, scoring system) for that year. League keys are built
 * as `{game_key}.l.{league_id}`, so we need this mapping to talk to any
 * season other than the current one.
 *
 * Source: empirical from the Yahoo API. Extend this when a new season opens.
 */
export const GAME_KEYS_BY_SEASON: Record<number, string> = {
  2018: '380',
  2019: '390',
  2020: '399',
  2021: '406',
  2022: '414',
  2023: '423',
  2024: '449',
  2025: '461',
};

export function gameKeyForSeason(season: number): string {
  const key = GAME_KEYS_BY_SEASON[season];
  if (!key) {
    throw new Error(`No Yahoo game_key registered for season ${season}. Add it to GAME_KEYS_BY_SEASON.`);
  }
  return key;
}

export function leagueKeyFor(season: number, leagueId: string | number): string {
  return `${gameKeyForSeason(season)}.l.${leagueId}`;
}

export type DiscoveredLeague = {
  season: number;
  gameKey: string;
  leagueId: string;
  leagueKey: string;
  name: string;
  numTeams: number | null;
  startWeek: number | null;
  endWeek: number | null;
  playoffStartWeek: number | null;
  isFinished: boolean;
};

/**
 * Pull every NFL league the authenticated user has been part of across the
 * given seasons. Yahoo's `/users;use_login=1/games;game_keys=.../leagues`
 * endpoint returns a nested structure: user → games → leagues, one games
 * entry per requested game_key.
 *
 * We pass game_keys explicitly (not season filters) because Yahoo only
 * knows about game_keys — that's why GAME_KEYS_BY_SEASON exists.
 */
export async function discoverUserLeagues(seasons: number[]): Promise<DiscoveredLeague[]> {
  const gameKeyToSeason = new Map<string, number>();
  for (const season of seasons) {
    gameKeyToSeason.set(gameKeyForSeason(season), season);
  }
  const gameKeyList = Array.from(gameKeyToSeason.keys()).join(',');

  const response = (await yahooFetch(
    `/users;use_login=1/games;game_keys=${gameKeyList}/leagues`,
  )) as Record<string, unknown>;

  // Structure:
  //   fantasy_content.users["0"].user[1].games["0"].game[1].leagues["0"].league[0] = info-array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usersObj = (response?.fantasy_content as any)?.users as Record<string, unknown> | undefined;
  const usersArr = usersObj ? iterateYahooObject(usersObj) : [];
  if (usersArr.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userPair = (usersArr[0] as any)?.user as unknown[] | undefined;
  if (!Array.isArray(userPair)) return [];

  // user[0] is the user info array, user[1] is { games: {...} }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gamesObj = (userPair[1] as any)?.games as Record<string, unknown> | undefined;
  if (!gamesObj) return [];

  const games = iterateYahooObject(gamesObj);
  const out: DiscoveredLeague[] = [];

  for (const gameEntry of games) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gamePair = (gameEntry as any)?.game as unknown[] | undefined;
    if (!Array.isArray(gamePair)) continue;

    const gameInfo = gamePair[0] as unknown[];
    const gameKey = findInArray(gameInfo, 'game_key') as string | undefined;
    if (!gameKey) continue;
    const season = gameKeyToSeason.get(gameKey);
    if (!season) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaguesObj = (gamePair[1] as any)?.leagues as Record<string, unknown> | undefined;
    if (!leaguesObj) continue;

    const leagues = iterateYahooObject(leaguesObj);
    for (const leagueEntry of leagues) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leaguePair = (leagueEntry as any)?.league as unknown[] | undefined;
      if (!Array.isArray(leaguePair)) continue;
      const leagueInfo = leaguePair[0] as unknown[];
      // Yahoo returns league info as either a flat array or a single object.
      // Normalize to an info-array we can findInArray over.
      const infoArr = Array.isArray(leagueInfo)
        ? leagueInfo
        : Object.entries(leagueInfo as Record<string, unknown>).map(([k, v]) => ({ [k]: v }));

      const leagueKey = findInArray(infoArr, 'league_key') as string | undefined;
      const leagueId = findInArray(infoArr, 'league_id') as string | undefined;
      const name = (findInArray(infoArr, 'name') as string | undefined) ?? '(unnamed league)';
      const numTeamsRaw = findInArray(infoArr, 'num_teams');
      const startWeekRaw = findInArray(infoArr, 'start_week');
      const endWeekRaw = findInArray(infoArr, 'end_week');
      const playoffStartRaw = findInArray(infoArr, 'playoff_start_week');
      const finishedRaw = findInArray(infoArr, 'is_finished');

      if (!leagueKey || !leagueId) continue;

      out.push({
        season,
        gameKey,
        leagueId,
        leagueKey,
        name,
        numTeams: numTeamsRaw != null ? parseInt(String(numTeamsRaw), 10) : null,
        startWeek: startWeekRaw != null ? parseInt(String(startWeekRaw), 10) : null,
        endWeek: endWeekRaw != null ? parseInt(String(endWeekRaw), 10) : null,
        playoffStartWeek: playoffStartRaw != null ? parseInt(String(playoffStartRaw), 10) : null,
        isFinished: finishedRaw === 1 || finishedRaw === '1' || finishedRaw === true,
      });
    }
  }

  return out;
}
