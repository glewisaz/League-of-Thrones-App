import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { discoverUserLeagues, GAME_KEYS_BY_SEASON } from '@/lib/yahoo/seasons';

/**
 * Discover the user's Yahoo leagues across historical seasons and upsert
 * them into `season_leagues` so the admin can pick which one to sync from.
 *
 * Query params:
 *   ?seasons=2018,2019,2020 (defaults to all seasons in GAME_KEYS_BY_SEASON
 *                            except the active one — those are already set up)
 *   ?persist=false          (preview only; skip the upsert)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const seasonsParam = url.searchParams.get('seasons');
    const persist = url.searchParams.get('persist') !== 'false';

    const seasons = seasonsParam
      ? seasonsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n))
      : Object.keys(GAME_KEYS_BY_SEASON).map(Number);

    if (seasons.length === 0) {
      return NextResponse.json({ error: 'no valid seasons specified' }, { status: 400 });
    }

    const discovered = await discoverUserLeagues(seasons);

    if (persist && discovered.length > 0) {
      const supabase = createAdminClient();
      for (const lg of discovered) {
        await supabase.from('season_leagues').upsert(
          {
            season: lg.season,
            yahoo_league_key: lg.leagueKey,
            league_name: lg.name,
            num_teams: lg.numTeams,
            start_week: lg.startWeek,
            end_week: lg.endWeek,
            playoff_start_week: lg.playoffStartWeek,
            is_finished: lg.isFinished,
          },
          { onConflict: 'season' },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      count: discovered.length,
      seasons_requested: seasons,
      leagues: discovered,
      persisted: persist,
    });
  } catch (err) {
    console.error('[discover-leagues]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
