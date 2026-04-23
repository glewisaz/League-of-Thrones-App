import { NextResponse } from 'next/server';
import { yahooFetch } from '@/lib/yahoo/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findInArray, iterateYahooObject, slugify } from '@/lib/yahoo/parse';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: auth, error: authError } = await supabase
      .from('yahoo_auth')
      .select('league_key')
      .eq('id', 1)
      .maybeSingle();
    if (authError) throw authError;
    if (!auth?.league_key) {
      return NextResponse.json(
        { error: 'league_key not set in yahoo_auth — set it via the admin panel first' },
        { status: 400 },
      );
    }

    const { data: seasonData } = await supabase
      .from('seasons')
      .select('year')
      .eq('is_active', true)
      .maybeSingle();
    const seasonYear = (seasonData as { year: number } | null)?.year ?? 2025;

    const response = (await yahooFetch(
      `/league/${auth.league_key}/teams;out=roster`,
    )) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueArr = (response?.fantasy_content as any)?.league as unknown[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamsObj = (leagueArr?.[1] as any)?.teams as Record<string, unknown> | undefined;

    if (!teamsObj) {
      return NextResponse.json(
        { error: 'Unexpected Yahoo response — could not find league[1].teams' },
        { status: 502 },
      );
    }

    // Snapshot existing player contracts so we don't create duplicates
    const { data: existingRows } = await supabase
      .from('contracts')
      .select('player_id')
      .not('player_id', 'is', null);
    const existingPlayerIds = new Set(
      (existingRows ?? [])
        .map((r: { player_id: string | null }) => r.player_id)
        .filter(Boolean) as string[],
    );

    const teams = iterateYahooObject(teamsObj);
    let playersUpserted = 0;
    let contractsCreated = 0;
    let teamsSkipped = 0;
    const errors: string[] = [];

    for (const entry of teams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamArr = (entry as any)?.team as unknown[] | undefined;
      if (!Array.isArray(teamArr)) continue;

      const teamInfo = teamArr[0] as unknown[];
      const teamName = findInArray(teamInfo, 'name') as string | undefined;
      if (!teamName) continue;

      const { data: teamRow } = await supabase
        .from('teams')
        .select('id')
        .eq('slug', slugify(teamName))
        .maybeSingle();

      if (!teamRow?.id) {
        console.warn(`[sync-rosters] No team row for slug "${slugify(teamName)}" — run sync-teams first`);
        teamsSkipped++;
        continue;
      }

      // Actual path: team[1].roster["0"].players  (not roster.players)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rosterPlayers = (teamArr[1] as any)?.roster?.['0']?.players as
        | Record<string, unknown>
        | undefined;
      if (!rosterPlayers) continue;

      const players = iterateYahooObject(rosterPlayers);

      for (const playerEntry of players) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playerArr = (playerEntry as any)?.player as unknown[] | undefined;
        if (!Array.isArray(playerArr)) continue;

        const playerInfo = playerArr[0] as unknown[];
        const playerKey = findInArray(playerInfo, 'player_key') as string | undefined;
        if (!playerKey) continue;

        const nameObj = findInArray(playerInfo, 'name') as { full?: string } | undefined;
        const name = nameObj?.full;
        if (!name) continue;

        const position = (findInArray(playerInfo, 'display_position') as string) ?? null;
        const nflTeam = (findInArray(playerInfo, 'editorial_team_abbr') as string) ?? null;

        const { error: playerError } = await supabase
          .from('players')
          .upsert(
            { yahoo_player_id: playerKey, name, position, nfl_team: nflTeam },
            { onConflict: 'yahoo_player_id' },
          );

        if (playerError) {
          errors.push(`player ${playerKey}: ${playerError.message}`);
          continue;
        }
        playersUpserted++;

        if (!existingPlayerIds.has(playerKey)) {
          const { error: contractError } = await supabase.from('contracts').insert({
            player_id: playerKey,
            current_team_id: teamRow.id,
            original_team_id: teamRow.id,
            acquisition_season: seasonYear,
            acquisition_type: 'auction',
            year_one_price: 0,
            contract_year: 1,
            status: 'active',
          });

          if (contractError) {
            errors.push(`contract for ${playerKey}: ${contractError.message}`);
          } else {
            existingPlayerIds.add(playerKey);
            contractsCreated++;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      season: seasonYear,
      players_upserted: playersUpserted,
      contracts_created: contractsCreated,
      ...(teamsSkipped > 0 && { teams_skipped: teamsSkipped, note: 'Run /api/yahoo/sync-teams first' }),
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('[sync-rosters]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
