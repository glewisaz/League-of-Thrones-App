import { NextRequest, NextResponse } from 'next/server';
import { yahooFetch } from '@/lib/yahoo/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findInArray, iterateYahooObject } from '@/lib/yahoo/parse';

type ParsedMatchup = {
  week: number;
  yahooMatchupId: string | null;
  teamAId: string;
  teamBId: string;
  teamAPoints: number;
  teamBPoints: number;
  winnerTeamId: string | null;
  isPlayoffs: boolean;
  isConsolation: boolean;
};

/**
 * Sync per-week scoreboard for a historical (or current) season.
 *
 * Yahoo's `/league/{key}/scoreboard;week={n}` returns the matchups for a
 * single week. We loop over the season's regular-season + playoff weeks
 * (1..end_week, falling back to 1..17 if Yahoo didn't expose end_week).
 *
 * Idempotent — the (season, week, team_a_id, team_b_id) unique index lets
 * us re-run safely. We canonicalize team_a < team_b so the same matchup
 * never produces two rows.
 *
 * Query params:
 *   ?season=YYYY  required
 *   ?weeks=1-17   optional, default to season's start_week..end_week
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const seasonRaw = url.searchParams.get('season');
    const weeksParam = url.searchParams.get('weeks');
    if (!seasonRaw) {
      return NextResponse.json({ error: 'season query param required' }, { status: 400 });
    }
    const season = parseInt(seasonRaw, 10);
    if (!Number.isFinite(season)) {
      return NextResponse.json({ error: 'season must be a number' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: leagueRow, error: leagueErr } = await supabase
      .from('season_leagues')
      .select('yahoo_league_key, start_week, end_week, playoff_start_week')
      .eq('season', season)
      .maybeSingle();
    if (leagueErr) throw leagueErr;
    if (!leagueRow?.yahoo_league_key) {
      return NextResponse.json(
        { error: `No league_key registered for season ${season}` },
        { status: 400 },
      );
    }

    let startWeek = leagueRow.start_week ?? 1;
    let endWeek = leagueRow.end_week ?? 17;
    if (weeksParam) {
      const [a, b] = weeksParam.split('-').map((n) => parseInt(n, 10));
      if (Number.isFinite(a)) startWeek = a;
      if (Number.isFinite(b)) endWeek = b;
    }
    const playoffStart = leagueRow.playoff_start_week ?? 15;

    const { data: keyRows } = await supabase
      .from('team_season_keys')
      .select('team_id, yahoo_team_key')
      .eq('season', season);
    const teamKeyMap = new Map<string, string>();
    for (const k of (keyRows ?? []) as { team_id: string; yahoo_team_key: string }[]) {
      teamKeyMap.set(k.yahoo_team_key, k.team_id);
    }
    if (teamKeyMap.size === 0) {
      return NextResponse.json(
        { error: `No team_season_keys for season ${season}. Run sync-teams-season first.` },
        { status: 400 },
      );
    }

    const allParsed: ParsedMatchup[] = [];
    const skipped: string[] = [];

    for (let week = startWeek; week <= endWeek; week++) {
      const response = (await yahooFetch(
        `/league/${leagueRow.yahoo_league_key}/scoreboard;week=${week}`,
      )) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leagueArr = (response?.fantasy_content as any)?.league as unknown[] | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scoreboard = (leagueArr?.[1] as any)?.scoreboard as Record<string, unknown> | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchupsObj = (scoreboard as any)?.['0']?.matchups as Record<string, unknown> | undefined;
      if (!matchupsObj) {
        skipped.push(`week ${week}: no matchups`);
        continue;
      }

      const matchups = iterateYahooObject(matchupsObj);
      for (const mu of matchups) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matchup = (mu as any)?.matchup as Record<string, unknown> | undefined;
        if (!matchup) continue;

        const weekVal = matchup.week ? parseInt(String(matchup.week), 10) : week;
        const isPlayoffs = matchup.is_playoffs === '1' || matchup.is_playoffs === 1 || weekVal >= playoffStart;
        const isConsolation = matchup.is_consolation === '1' || matchup.is_consolation === 1;
        const winnerKey = matchup.winner_team_key as string | undefined;
        const yahooMatchupId = (matchup.matchup_id as string | undefined) ?? null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const teamsObj = (matchup['0'] as any)?.teams as Record<string, unknown> | undefined;
        if (!teamsObj) continue;
        const teamPair = iterateYahooObject(teamsObj);
        if (teamPair.length !== 2) continue;

        const sides: { teamKey: string; teamId: string | null; points: number }[] = [];
        for (const tEntry of teamPair) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tArr = (tEntry as any)?.team as unknown[] | undefined;
          if (!Array.isArray(tArr)) continue;
          const info = tArr[0] as unknown[];
          const teamKey = findInArray(info, 'team_key') as string | undefined;
          if (!teamKey) continue;
          // Find team_points anywhere in the rest of the array.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let pts: any = null;
          for (let i = 1; i < tArr.length; i++) {
            const el = tArr[i] as Record<string, unknown> | undefined;
            if (el && typeof el === 'object' && 'team_points' in el) {
              pts = el.team_points;
              break;
            }
          }
          const totalRaw = (pts as Record<string, unknown> | null)?.total;
          const total = totalRaw != null ? parseFloat(String(totalRaw)) : 0;
          sides.push({ teamKey, teamId: teamKeyMap.get(teamKey) ?? null, points: total });
        }

        if (sides.length !== 2 || sides[0].teamId == null || sides[1].teamId == null) {
          skipped.push(`week ${week}: unmapped team in matchup`);
          continue;
        }
        const resolvedSides = sides as { teamKey: string; teamId: string; points: number }[];

        // Canonicalize by team_id string ordering for the CHECK constraint.
        const [a, b] =
          resolvedSides[0].teamId < resolvedSides[1].teamId
            ? [resolvedSides[0], resolvedSides[1]]
            : [resolvedSides[1], resolvedSides[0]];

        const winnerTeamId =
          winnerKey == null
            ? null
            : winnerKey === a.teamKey
              ? a.teamId
              : winnerKey === b.teamKey
                ? b.teamId
                : null;

        allParsed.push({
          week: weekVal,
          yahooMatchupId,
          teamAId: a.teamId,
          teamBId: b.teamId,
          teamAPoints: a.points,
          teamBPoints: b.points,
          winnerTeamId,
          isPlayoffs,
          isConsolation,
        });
      }
    }

    let upserted = 0;
    const errors: string[] = [];
    for (const m of allParsed) {
      const { error } = await supabase.from('matchups').upsert(
        {
          season,
          week: m.week,
          team_a_id: m.teamAId,
          team_b_id: m.teamBId,
          team_a_points: m.teamAPoints,
          team_b_points: m.teamBPoints,
          winner_team_id: m.winnerTeamId,
          is_playoffs: m.isPlayoffs,
          is_consolation: m.isConsolation,
          yahoo_matchup_id: m.yahooMatchupId,
        },
        { onConflict: 'season,week,team_a_id,team_b_id' },
      );
      if (error) errors.push(`week ${m.week}: ${error.message}`);
      else upserted++;
    }

    return NextResponse.json({
      ok: true,
      season,
      weeks_pulled: endWeek - startWeek + 1,
      matchups_upserted: upserted,
      ...(skipped.length > 0 && { skipped }),
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('[sync-matchups]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
