import { NextResponse } from 'next/server';
import { yahooFetch } from '@/lib/yahoo/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findInArray, iterateYahooObject } from '@/lib/yahoo/parse';

// Hardcoded to 2025 — we're backfilling the final regular-season standings
// from the completed 2025 Yahoo league. The active season is now 2026.
const STANDINGS_SEASON = 2025;

type ParsedStanding = {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  seed: number;
};

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
        { error: 'league_key not set in yahoo_auth — run Yahoo OAuth connect first' },
        { status: 400 },
      );
    }

    // Pre-load yahoo_team_key → team UUID for all teams.
    // sync-teams must have run first to populate yahoo_team_key.
    const { data: teamRows, error: teamsError } = await supabase
      .from('teams')
      .select('id, yahoo_team_key');
    if (teamsError) throw teamsError;

    const teamKeyMap = new Map<string, string>();
    for (const t of (teamRows ?? []) as { id: string; yahoo_team_key: string | null }[]) {
      if (t.yahoo_team_key) teamKeyMap.set(t.yahoo_team_key, t.id);
    }

    // Yahoo standings endpoint — returns teams in rank order with team_standings attached.
    const response = (await yahooFetch(`/league/${auth.league_key}/standings`)) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueArr = (response?.fantasy_content as any)?.league as unknown[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const standingsArr = (leagueArr?.[1] as any)?.standings as unknown[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamsObj = (standingsArr?.[0] as any)?.teams as Record<string, unknown> | undefined;

    if (!teamsObj) {
      return NextResponse.json(
        { error: 'Unexpected Yahoo response — could not find standings[0].teams' },
        { status: 502 },
      );
    }

    const teams = iterateYahooObject(teamsObj);
    console.log('[sync-standings] Teams found in Yahoo response:', teams.length);

    const parsed: ParsedStanding[] = [];

    for (const entry of teams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamArr = (entry as any)?.team as unknown[] | undefined;
      if (!Array.isArray(teamArr)) continue;

      // teamArr[0] — info array: [{team_key}, {name}, ...]
      // teamArr[1] — { team_standings: { outcome_totals, points_for, points_against, rank } }
      const info = teamArr[0] as unknown[];
      const teamKey = findInArray(info, 'team_key') as string | undefined;
      if (!teamKey) continue;

      const teamId = teamKeyMap.get(teamKey);
      if (!teamId) {
        console.warn(`[sync-standings] No DB row for yahoo_team_key "${teamKey}" — run sync-teams first`);
        continue;
      }

      // teamArr[0] — flat info array  [{team_key}, {team_id}, {name}, ...]
      // teamArr[1] — { team_points: {...} }
      // teamArr[2] — { team_standings: { rank, playoff_seed, outcome_totals, points_for, points_against } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts = (teamArr[2] as any)?.team_standings as Record<string, unknown> | undefined;

      if (parsed.length === 0) {
        console.log(`[sync-standings] First team key: "${teamKey}", teamArr[2]:`, JSON.stringify(teamArr[2], null, 2));
      }

      if (!ts) {
        console.warn(`[sync-standings] No team_standings at teamArr[2] for "${teamKey}"`);
        continue;
      }

      const ot = ts.outcome_totals as Record<string, string> | undefined;

      parsed.push({
        teamId,
        wins: parseInt((ot?.wins ?? '0'), 10),
        losses: parseInt((ot?.losses ?? '0'), 10),
        ties: parseInt((ot?.ties ?? '0'), 10),
        pointsFor: parseFloat((ts.points_for as string) ?? '0'),
        pointsAgainst: parseFloat((ts.points_against as string) ?? '0'),
        seed: typeof ts.playoff_seed === 'number' ? ts.playoff_seed : parseInt(ts.playoff_seed as string, 10),
      });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const s of parsed) {
      const { error } = await supabase
        .from('standings')
        .upsert(
          {
            season: STANDINGS_SEASON,
            team_id: s.teamId,
            wins: s.wins,
            losses: s.losses,
            ties: s.ties,
            points_for: s.pointsFor,
            points_against: s.pointsAgainst,
            seed: s.seed,
          },
          { onConflict: 'season,team_id' },
        );

      if (error) {
        errors.push(`${s.teamId}: ${error.message}`);
      } else {
        synced++;
      }
    }

    return NextResponse.json({
      ok: true,
      standings_synced: synced,
      season: STANDINGS_SEASON,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('[sync-standings]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
