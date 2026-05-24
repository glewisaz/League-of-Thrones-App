import { NextRequest, NextResponse } from 'next/server';
import { yahooFetch } from '@/lib/yahoo/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findInArray, iterateYahooObject } from '@/lib/yahoo/parse';

type ParsedRosterPlayer = {
  yahooPlayerId: string;
  name: string;
  position: string | null;
  selectedPosition: string | null;
};

/**
 * Capture an end-of-regular-season roster snapshot for every team in a
 * historical season. Uses `team/{key}/roster;week={n}` for each team_key
 * in team_season_keys for that season.
 *
 * The week defaults to (playoff_start_week - 1), i.e. the final week of
 * the regular season. Override with ?week=N.
 *
 * Query params:
 *   ?season=YYYY  required
 *   ?week=N       optional (defaults to last regular-season week)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const seasonRaw = url.searchParams.get('season');
    const weekRaw = url.searchParams.get('week');
    if (!seasonRaw) {
      return NextResponse.json({ error: 'season query param required' }, { status: 400 });
    }
    const season = parseInt(seasonRaw, 10);
    if (!Number.isFinite(season)) {
      return NextResponse.json({ error: 'season must be a number' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: leagueRow } = await supabase
      .from('season_leagues')
      .select('playoff_start_week, end_week')
      .eq('season', season)
      .maybeSingle();

    const week =
      weekRaw != null
        ? parseInt(weekRaw, 10)
        : leagueRow?.playoff_start_week
          ? leagueRow.playoff_start_week - 1
          : 14;

    const { data: keyRows } = await supabase
      .from('team_season_keys')
      .select('team_id, yahoo_team_key')
      .eq('season', season);
    const keys = (keyRows ?? []) as { team_id: string; yahoo_team_key: string }[];
    if (keys.length === 0) {
      return NextResponse.json(
        { error: `No team_season_keys for season ${season}. Run sync-teams-season first.` },
        { status: 400 },
      );
    }

    let totalWritten = 0;
    const perTeam: Record<string, number> = {};
    const errors: string[] = [];

    for (const { team_id, yahoo_team_key } of keys) {
      try {
        const response = (await yahooFetch(
          `/team/${yahoo_team_key}/roster;week=${week}`,
        )) as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const teamArr = (response?.fantasy_content as any)?.team as unknown[] | undefined;
        // roster lives at teamArr[1].roster["0"].players
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const roster = (teamArr?.[1] as any)?.roster as Record<string, unknown> | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playersObj = (roster as any)?.['0']?.players as Record<string, unknown> | undefined;
        if (!playersObj) {
          errors.push(`${yahoo_team_key}: no players in roster response`);
          continue;
        }

        const players = iterateYahooObject(playersObj);
        const parsed: ParsedRosterPlayer[] = [];

        for (const pEntry of players) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pArr = (pEntry as any)?.player as unknown[] | undefined;
          if (!Array.isArray(pArr)) continue;
          // pArr[0] is an outer array; the *real* flat info array is pArr[0][0]
          // (an array of single-key objects). The selected_position sits later
          // in pArr at index 1 as { selected_position: [...] }.
          const flatInfo = pArr[0] as unknown[];
          if (!Array.isArray(flatInfo)) continue;
          const playerKey = findInArray(flatInfo, 'player_key') as string | undefined;
          const nameObj = findInArray(flatInfo, 'name') as Record<string, string> | undefined;
          const displayPos = findInArray(flatInfo, 'display_position') as string | undefined;
          if (!playerKey || !nameObj?.full) continue;

          // selected_position is nested: pArr[1].selected_position is array
          // [{coverage_type, week}, {position: "WR"}, {is_flex: 0}]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const selPos = (pArr[1] as any)?.selected_position as unknown[] | undefined;
          const selectedPos = Array.isArray(selPos)
            ? (findInArray(selPos, 'position') as string | undefined) ?? null
            : null;

          parsed.push({
            yahooPlayerId: playerKey,
            name: nameObj.full,
            position: displayPos ?? null,
            selectedPosition: selectedPos,
          });
        }

        for (const p of parsed) {
          const { error } = await supabase.from('historical_rosters').upsert(
            {
              season,
              team_id,
              yahoo_player_id: p.yahooPlayerId,
              player_name: p.name,
              position: p.position,
              selected_position: p.selectedPosition,
            },
            { onConflict: 'season,team_id,player_name' },
          );
          if (error) errors.push(`${yahoo_team_key}/${p.name}: ${error.message}`);
          else totalWritten++;
        }
        perTeam[yahoo_team_key] = parsed.length;
      } catch (e) {
        errors.push(`${yahoo_team_key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      season,
      week,
      teams_processed: Object.keys(perTeam).length,
      players_written: totalWritten,
      per_team: perTeam,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('[sync-historical-rosters]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
