import { NextResponse } from 'next/server';
import { yahooFetch } from '@/lib/yahoo/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findInArray, iterateYahooObject } from '@/lib/yahoo/parse';
import { getActiveSeason } from '@/lib/queries/seasons';

type ParsedStanding = {
  teamId: string;
  conference: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  seed: number; // computed within conference after all teams are parsed
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

    const season = await getActiveSeason();
    const seasonYear = season?.year ?? new Date().getFullYear();

    // Pre-load yahoo_team_key → { id, conference } for all teams.
    // sync-teams must have run first to populate yahoo_team_key.
    const { data: teamRows, error: teamsError } = await supabase
      .from('teams')
      .select('id, conference, yahoo_team_key');
    if (teamsError) throw teamsError;

    const teamKeyMap = new Map<string, { id: string; conference: string | null }>();
    for (const t of (teamRows ?? []) as { id: string; conference: string | null; yahoo_team_key: string | null }[]) {
      if (t.yahoo_team_key) teamKeyMap.set(t.yahoo_team_key, { id: t.id, conference: t.conference });
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

      const dbTeam = teamKeyMap.get(teamKey);
      if (!dbTeam) {
        console.warn(`[sync-standings] No DB row for yahoo_team_key "${teamKey}" — run sync-teams first`);
        continue;
      }

      // team_standings lives at teamArr[1]; fall back to scanning the info array
      // in case Yahoo restructures the response between seasons.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts = ((teamArr[1] as any)?.team_standings ??
        findInArray(info, 'team_standings')) as Record<string, unknown> | undefined;
      if (!ts) {
        console.warn(`[sync-standings] No team_standings for "${teamKey}"`);
        continue;
      }

      const ot = ts.outcome_totals as Record<string, string> | undefined;

      parsed.push({
        teamId: dbTeam.id,
        conference: dbTeam.conference,
        wins: parseInt((ot?.wins ?? '0'), 10),
        losses: parseInt((ot?.losses ?? '0'), 10),
        ties: parseInt((ot?.ties ?? '0'), 10),
        pointsFor: parseFloat((ts.points_for as string) ?? '0'),
        pointsAgainst: parseFloat((ts.points_against as string) ?? '0'),
        seed: 0,
      });
    }

    // Compute seed within each conference. Yahoo's top-level rank is the overall
    // league rank (1–12); we want 1–6 per conference. Sort wins DESC, then PF DESC.
    const byConference = new Map<string, ParsedStanding[]>();
    for (const s of parsed) {
      const key = s.conference ?? 'unknown';
      if (!byConference.has(key)) byConference.set(key, []);
      byConference.get(key)!.push(s);
    }
    for (const group of byConference.values()) {
      group.sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
      group.forEach((s, i) => { s.seed = i + 1; });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const s of parsed) {
      const { error } = await supabase
        .from('standings')
        .upsert(
          {
            season: seasonYear,
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
      season: seasonYear,
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
