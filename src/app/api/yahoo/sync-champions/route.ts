import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Derive champion + runner-up from the championship matchup for a given season.
 *
 * The championship matchup is defined as: the highest-week playoff matchup
 * that is NOT a consolation game. We rely on sync-matchups having populated
 * the matchups table for this season first.
 *
 * Division crowns (north_crown, south_crown) are intentionally left for the
 * commissioner to set manually in the admin UI — division assignments
 * weren't always present in Yahoo and require commissioner judgment to map
 * to our current `conference` enum.
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

    const { data: matchups, error } = await supabase
      .from('matchups')
      .select('week, team_a_id, team_b_id, team_a_points, team_b_points, winner_team_id, is_playoffs, is_consolation')
      .eq('season', season)
      .eq('is_playoffs', true)
      .eq('is_consolation', false)
      .order('week', { ascending: false })
      .limit(1);
    if (error) throw error;

    if (!matchups || matchups.length === 0) {
      return NextResponse.json(
        { error: `No championship matchup found for ${season}. Run sync-matchups first.` },
        { status: 404 },
      );
    }

    const final = matchups[0] as {
      week: number;
      team_a_id: string;
      team_b_id: string;
      winner_team_id: string | null;
    };

    if (!final.winner_team_id) {
      return NextResponse.json(
        { error: `Championship matchup in week ${final.week} has no winner_team_id` },
        { status: 422 },
      );
    }

    const championId = final.winner_team_id;
    const runnerUpId = championId === final.team_a_id ? final.team_b_id : final.team_a_id;

    const { error: upsertErr } = await supabase
      .from('champions')
      .upsert(
        {
          season,
          champion_team_id: championId,
          runner_up_team_id: runnerUpId,
        },
        { onConflict: 'season' },
      );
    if (upsertErr) throw upsertErr;

    // Also set final_placement on the two finalists in the standings table
    // so the franchise page can show "Champion / Runner-up" in the season row.
    await supabase
      .from('standings')
      .update({ final_placement: 1 })
      .eq('season', season)
      .eq('team_id', championId);
    await supabase
      .from('standings')
      .update({ final_placement: 2 })
      .eq('season', season)
      .eq('team_id', runnerUpId);

    return NextResponse.json({
      ok: true,
      season,
      champion_team_id: championId,
      runner_up_team_id: runnerUpId,
      championship_week: final.week,
    });
  } catch (err) {
    console.error('[sync-champions]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
