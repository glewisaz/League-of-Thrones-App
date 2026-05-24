import { NextRequest, NextResponse } from 'next/server';
import { yahooFetch } from '@/lib/yahoo/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findInArray, iterateYahooObject } from '@/lib/yahoo/parse';

type YahooTeamSummary = {
  yahooTeamKey: string;
  yahooTeamName: string;
  manager: string | null;
};

type MatchResult = {
  yahoo: YahooTeamSummary;
  matched_team_id: string | null;
  matched_owner_name: string | null;
  /** "exact", "loose" (case/whitespace), or null for no match */
  match_kind: 'exact' | 'loose' | null;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Sync historical Yahoo team_keys for a given season into `team_season_keys`.
 *
 * Reads `season_leagues.yahoo_league_key` to know which league to pull from
 * (populated by `/api/yahoo/discover-leagues`). Attempts to match each Yahoo
 * team to a current franchise by manager nickname → teams.owner_name, then
 * writes the matched pairs to team_season_keys.
 *
 * Conflicts (no match or ambiguous match) are returned in the response so
 * the admin UI can let the commissioner resolve them via the manual-mapping
 * endpoint.
 *
 * Query params:
 *   ?season=YYYY            required
 *   ?dry_run=true           preview only, no DB writes
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const seasonRaw = url.searchParams.get('season');
    const dryRun = url.searchParams.get('dry_run') === 'true';
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
        { error: `No league_key registered for season ${season}. Run /api/yahoo/discover-leagues first.` },
        { status: 400 },
      );
    }

    const response = (await yahooFetch(
      `/league/${leagueRow.yahoo_league_key}/teams`,
    )) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueArr = (response?.fantasy_content as any)?.league as unknown[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamsObj = (leagueArr?.[1] as any)?.teams as Record<string, unknown> | undefined;
    if (!teamsObj) {
      return NextResponse.json({ error: 'Unexpected Yahoo response — could not find league[1].teams' }, { status: 502 });
    }

    const teams = iterateYahooObject(teamsObj);
    const yahooSummaries: YahooTeamSummary[] = [];

    for (const entry of teams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamArr = (entry as any)?.team as unknown[] | undefined;
      if (!Array.isArray(teamArr)) continue;
      const info = teamArr[0] as unknown[];
      const yahooTeamKey = findInArray(info, 'team_key') as string | undefined;
      const yahooTeamName = (findInArray(info, 'name') as string | undefined) ?? '(unnamed)';
      // managers is an array of { manager: { nickname, ... } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const managersArr = findInArray(info, 'managers') as any;
      const nickname: string | null =
        managersArr?.[0]?.manager?.nickname ?? managersArr?.manager?.nickname ?? null;
      if (!yahooTeamKey) continue;
      yahooSummaries.push({ yahooTeamKey, yahooTeamName, manager: nickname });
    }

    const { data: dbTeams, error: dbErr } = await supabase
      .from('teams')
      .select('id, owner_name');
    if (dbErr) throw dbErr;
    const dbTeamRows = (dbTeams ?? []) as { id: string; owner_name: string }[];

    // Build lookup: normalized owner_name → [team_id]. Lists not single ids,
    // so we can detect collisions (two owners with the same normalized name).
    const exactIdx = new Map<string, string[]>();
    for (const t of dbTeamRows) {
      const key = normalize(t.owner_name);
      const list = exactIdx.get(key) ?? [];
      list.push(t.id);
      exactIdx.set(key, list);
    }

    const matches: MatchResult[] = yahooSummaries.map((yt) => {
      if (!yt.manager) {
        return { yahoo: yt, matched_team_id: null, matched_owner_name: null, match_kind: null };
      }
      const norm = normalize(yt.manager);
      const candidates = exactIdx.get(norm);
      if (candidates && candidates.length === 1) {
        const owner = dbTeamRows.find((t) => t.id === candidates[0])!.owner_name;
        return {
          yahoo: yt,
          matched_team_id: candidates[0],
          matched_owner_name: owner,
          match_kind: 'exact',
        };
      }
      // Loose: substring either direction
      const loose = dbTeamRows.filter((t) => {
        const n = normalize(t.owner_name);
        return n.includes(norm) || norm.includes(n);
      });
      if (loose.length === 1) {
        return {
          yahoo: yt,
          matched_team_id: loose[0].id,
          matched_owner_name: loose[0].owner_name,
          match_kind: 'loose',
        };
      }
      return { yahoo: yt, matched_team_id: null, matched_owner_name: null, match_kind: null };
    });

    const resolved = matches.filter((m) => m.matched_team_id != null);
    const unresolved = matches.filter((m) => m.matched_team_id == null);

    let written = 0;
    if (!dryRun) {
      for (const m of resolved) {
        const { error } = await supabase.from('team_season_keys').upsert(
          {
            team_id: m.matched_team_id!,
            season,
            yahoo_team_key: m.yahoo.yahooTeamKey,
            yahoo_league_key: leagueRow.yahoo_league_key,
            yahoo_team_name: m.yahoo.yahooTeamName,
            yahoo_manager: m.yahoo.manager,
          },
          { onConflict: 'team_id,season' },
        );
        if (!error) written++;
      }
    }

    return NextResponse.json({
      ok: true,
      season,
      league_key: leagueRow.yahoo_league_key,
      yahoo_teams: yahooSummaries.length,
      auto_matched: resolved.length,
      written,
      unresolved,
      dry_run: dryRun,
    });
  } catch (err) {
    console.error('[sync-teams-season]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/**
 * Manually resolve team-mapping conflicts surfaced by the GET handler.
 * Body: { season: number, mappings: { [yahoo_team_key]: team_id } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      season?: number;
      mappings?: Record<string, string>;
    };
    if (!body.season || !body.mappings) {
      return NextResponse.json(
        { error: 'body must include { season, mappings: { yahoo_team_key: team_id } }' },
        { status: 400 },
      );
    }
    const supabase = createAdminClient();
    const { data: leagueRow } = await supabase
      .from('season_leagues')
      .select('yahoo_league_key')
      .eq('season', body.season)
      .maybeSingle();
    if (!leagueRow?.yahoo_league_key) {
      return NextResponse.json(
        { error: `No league_key registered for season ${body.season}` },
        { status: 400 },
      );
    }

    let written = 0;
    const errors: string[] = [];
    for (const [yahooTeamKey, teamId] of Object.entries(body.mappings)) {
      const { error } = await supabase.from('team_season_keys').upsert(
        {
          team_id: teamId,
          season: body.season,
          yahoo_team_key: yahooTeamKey,
          yahoo_league_key: leagueRow.yahoo_league_key,
        },
        { onConflict: 'team_id,season' },
      );
      if (error) errors.push(`${yahooTeamKey}: ${error.message}`);
      else written++;
    }

    return NextResponse.json({
      ok: true,
      season: body.season,
      written,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('[sync-teams-season POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
