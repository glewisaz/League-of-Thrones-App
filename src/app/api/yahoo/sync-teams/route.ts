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

    const response = (await yahooFetch(`/league/${auth.league_key}/teams`)) as Record<
      string,
      unknown
    >;
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

    const teams = iterateYahooObject(teamsObj);
    const upserted: string[] = [];
    const failed: string[] = [];

    for (const entry of teams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamArr = (entry as any)?.team as unknown[] | undefined;
      if (!Array.isArray(teamArr)) continue;

      const info = teamArr[0] as unknown[];
      const name = findInArray(info, 'name') as string | undefined;
      if (!name) continue;

      const teamKey = findInArray(info, 'team_key') as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logosArr = findInArray(info, 'team_logos') as any;
      // Yahoo returns team_logos as [{team_logo:{url:...}}]
      const logoUrl: string | null = logosArr?.[0]?.team_logo?.url ?? null;

      const slug = slugify(name);

      const { error } = await supabase.from('teams').upsert(
        { name, slug, logo_url: logoUrl, yahoo_team_key: teamKey ?? null },
        { onConflict: 'slug', ignoreDuplicates: false },
      );

      if (error) {
        console.error(`[sync-teams] upsert failed for "${name}":`, error.message);
        failed.push(name);
      } else {
        upserted.push(name);
      }
    }

    return NextResponse.json({
      ok: true,
      teams_upserted: upserted.length,
      teams_failed: failed.length,
      upserted,
      ...(failed.length > 0 && { failed }),
    });
  } catch (err) {
    console.error('[sync-teams]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
