import { NextRequest, NextResponse } from 'next/server';
import { yahooFetch } from '@/lib/yahoo/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findInArray, iterateYahooObject } from '@/lib/yahoo/parse';

type ParsedStanding = {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  seed: number | null;
  outcome: string | null;
};

/**
 * Sync final standings for any registered historical season. Maps Yahoo
 * team_keys back to our team UUIDs via the team_season_keys table — so
 * sync-teams-season must have run for this season first.
 *
 * Query params:
 *   ?season=YYYY  required
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const seasonRaw = url.searchParams.get('season');
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
      .select('yahoo_league_key')
      .eq('season', season)
      .maybeSingle();
    if (leagueErr) throw leagueErr;
    if (!leagueRow?.yahoo_league_key) {
      return NextResponse.json(
        { error: `No league_key registered for season ${season}` },
        { status: 400 },
      );
    }

    const { data: keyRows, error: keyErr } = await supabase
      .from('team_season_keys')
      .select('team_id, yahoo_team_key')
      .eq('season', season);
    if (keyErr) throw keyErr;
    const teamKeyMap = new Map<string, string>();
    for (const k of (keyRows ?? []) as { team_id: string; yahoo_team_key: string }[]) {
      teamKeyMap.set(k.yahoo_team_key, k.team_id);
    }
    if (teamKeyMap.size === 0) {
      return NextResponse.json(
        { error: `No team_season_keys for season ${season}. Run /api/yahoo/sync-teams-season first.` },
        { status: 400 },
      );
    }

    const response = (await yahooFetch(
      `/league/${leagueRow.yahoo_league_key}/standings`,
    )) as Record<string, unknown>;
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
    const parsed: ParsedStanding[] = [];
    const unmapped: string[] = [];

    for (const entry of teams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamArr = (entry as any)?.team as unknown[] | undefined;
      if (!Array.isArray(teamArr)) continue;

      const info = teamArr[0] as unknown[];
      const teamKey = findInArray(info, 'team_key') as string | undefined;
      if (!teamKey) continue;
      const teamId = teamKeyMap.get(teamKey);
      if (!teamId) {
        unmapped.push(teamKey);
        continue;
      }

      // The team-level array order varies by season — search rather than
      // index. Look for the element that contains team_standings.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ts: any = null;
      for (let i = 1; i < teamArr.length; i++) {
        const el = teamArr[i] as Record<string, unknown> | undefined;
        if (el && typeof el === 'object' && 'team_standings' in el) {
          ts = el.team_standings;
          break;
        }
      }
      if (!ts) continue;

      const ot = ts.outcome_totals as Record<string, string> | undefined;
      const seedRaw = ts.playoff_seed;
      const seed =
        seedRaw == null || seedRaw === '' ? null
          : typeof seedRaw === 'number' ? seedRaw
          : parseInt(seedRaw as string, 10);

      parsed.push({
        teamId,
        wins: parseInt(ot?.wins ?? '0', 10),
        losses: parseInt(ot?.losses ?? '0', 10),
        ties: parseInt(ot?.ties ?? '0', 10),
        pointsFor: parseFloat((ts.points_for as string) ?? '0'),
        pointsAgainst: parseFloat((ts.points_against as string) ?? '0'),
        seed,
        outcome: (ts.outcome as string | undefined) ?? null,
      });
    }

    let synced = 0;
    const errors: string[] = [];
    for (const s of parsed) {
      const { error } = await supabase.from('standings').upsert(
        {
          season,
          team_id: s.teamId,
          wins: s.wins,
          losses: s.losses,
          ties: s.ties,
          points_for: s.pointsFor,
          points_against: s.pointsAgainst,
          seed: s.seed,
          yahoo_outcome: s.outcome,
        },
        { onConflict: 'season,team_id' },
      );
      if (error) errors.push(`${s.teamId}: ${error.message}`);
      else synced++;
    }

    await supabase
      .from('season_leagues')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('season', season);

    return NextResponse.json({
      ok: true,
      season,
      standings_synced: synced,
      ...(unmapped.length > 0 && { unmapped_yahoo_team_keys: unmapped }),
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('[sync-standings-season]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
