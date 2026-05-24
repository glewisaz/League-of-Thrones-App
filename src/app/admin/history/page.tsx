import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';
import HistoryPanel, { type SeasonStatus } from './HistoryPanel';

export const dynamic = 'force-dynamic';

export default async function HistoryAdminPage() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/admin/login');

  const admin = createAdminClient();

  // Pull all seasons + per-season status. Aggregated counts let us show
  // a checklist (discovered / teams-mapped / standings / matchups / champion)
  // without round-tripping per season.
  const [
    { data: seasons },
    { data: leagues },
    { data: keyCounts },
    { data: standingsCounts },
    { data: matchupCounts },
    { data: champions },
    { data: rosterCounts },
  ] = await Promise.all([
    admin.from('seasons').select('year, is_active').order('year'),
    admin.from('season_leagues').select('*'),
    admin.from('team_season_keys').select('season'),
    admin.from('standings').select('season'),
    admin.from('matchups').select('season'),
    admin.from('champions').select('season, champion_team_id'),
    admin.from('historical_rosters').select('season'),
  ]);

  const tally = (rows: { season: number }[] | null) => {
    const m = new Map<number, number>();
    for (const r of rows ?? []) m.set(r.season, (m.get(r.season) ?? 0) + 1);
    return m;
  };

  const leagueBySeason = new Map(
    (leagues ?? []).map((l) => [
      (l as Record<string, unknown>).season as number,
      l as Record<string, unknown>,
    ]),
  );
  const keyTally = tally(keyCounts as { season: number }[] | null);
  const standingsTally = tally(standingsCounts as { season: number }[] | null);
  const matchupTally = tally(matchupCounts as { season: number }[] | null);
  const rosterTally = tally(rosterCounts as { season: number }[] | null);
  const championSet = new Set(
    (champions ?? [])
      .map((c) => (c as Record<string, unknown>).champion_team_id ? (c as Record<string, unknown>).season as number : null)
      .filter((s): s is number => s != null),
  );

  const statuses: SeasonStatus[] = (seasons ?? []).map((s) => {
    const year = (s as Record<string, unknown>).year as number;
    const lg = leagueBySeason.get(year);
    return {
      season: year,
      is_active: Boolean((s as Record<string, unknown>).is_active),
      league_key: (lg?.yahoo_league_key as string | undefined) ?? null,
      league_name: (lg?.league_name as string | undefined) ?? null,
      num_teams: (lg?.num_teams as number | undefined) ?? null,
      teams_mapped: keyTally.get(year) ?? 0,
      standings_count: standingsTally.get(year) ?? 0,
      matchups_count: matchupTally.get(year) ?? 0,
      roster_count: rosterTally.get(year) ?? 0,
      has_champion: championSet.has(year),
      last_synced_at: (lg?.last_synced_at as string | undefined) ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e8eaf0]">
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="mb-8">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Small Council</p>
          <h1 className="text-2xl font-bold text-[#00E5FF]">Historical Yahoo Data</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Backfill prior seasons from Yahoo. Run steps in order, top to bottom, per season.
          </p>
        </div>

        <HistoryPanel statuses={statuses} />
      </div>
    </div>
  );
}
