import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTeamBySlug } from '@/lib/queries/teams';
import {
  getFranchiseStandings,
  getFranchiseChampionships,
  getHeadToHeadAllTime,
  summarizeAllTime,
} from '@/lib/queries/history';

export const revalidate = 3600;

function PlacementBadge({ placement }: { placement: number | null }) {
  if (placement == null) return <span className="text-neutral-700">—</span>;
  if (placement === 1)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-yellow-400/15 text-yellow-300 border border-yellow-400/30">
        Champion
      </span>
    );
  if (placement === 2)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-neutral-400/15 text-neutral-300 border border-neutral-500/30">
        Runner-up
      </span>
    );
  return <span className="num text-neutral-400">{placement}</span>;
}

function fmtPct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return (num / denom).toFixed(3).replace(/^0/, '');
}

export default async function FranchisePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const [standings, championships, h2h] = await Promise.all([
    getFranchiseStandings(team.id),
    getFranchiseChampionships(team.id),
    getHeadToHeadAllTime(team.id),
  ]);
  const allTime = summarizeAllTime(
    standings,
    championships.championship_seasons.length,
    championships.runner_up_seasons.length,
  );
  const totalGames = allTime.wins + allTime.losses + allTime.ties;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <nav className="text-sm text-neutral-500 mb-6">
        <Link href="/" className="hover:text-neutral-300 transition-colors">
          Teams
        </Link>
        <span className="mx-2 text-neutral-700">/</span>
        <Link
          href={`/teams/${team.slug}`}
          className="hover:text-neutral-300 transition-colors"
        >
          {team.owner_name}
        </Link>
        <span className="mx-2 text-neutral-700">/</span>
        <span className="text-neutral-300">History</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-accent">{team.owner_name}</h1>
        <p className="text-neutral-500 mt-1">Franchise history</p>
      </div>

      {/* All-time totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="All-time record"
          value={`${allTime.wins}-${allTime.losses}${allTime.ties ? `-${allTime.ties}` : ''}`}
          subtitle={`${fmtPct(allTime.wins + allTime.ties * 0.5, totalGames)} win pct`}
        />
        <StatCard
          label="Seasons played"
          value={String(allTime.seasons_played)}
          subtitle={
            standings.length > 0
              ? `${Math.min(...standings.map((s) => s.season))}–${Math.max(...standings.map((s) => s.season))}`
              : '—'
          }
        />
        <StatCard
          label="Championships"
          value={String(allTime.championships)}
          subtitle={
            championships.championship_seasons.length > 0
              ? championships.championship_seasons.join(', ')
              : '—'
          }
        />
        <StatCard
          label="Avg PF / season"
          value={
            allTime.seasons_played > 0
              ? (allTime.points_for / allTime.seasons_played).toFixed(1)
              : '—'
          }
          subtitle={`PA ${
            allTime.seasons_played > 0
              ? (allTime.points_against / allTime.seasons_played).toFixed(1)
              : '—'
          }`}
        />
      </div>

      {/* Season-by-season */}
      <h2 className="text-lg font-semibold text-neutral-200 mb-4">Season by season</h2>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden mb-10">
        {standings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Year</th>
                  <th className="text-center px-4 py-3 font-medium">Record</th>
                  <th className="text-right px-4 py-3 font-medium">PF</th>
                  <th className="text-right px-4 py-3 font-medium">PA</th>
                  <th className="hidden md:table-cell text-center px-4 py-3 font-medium">Seed</th>
                  <th className="text-center px-4 py-3 font-medium">Finish</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr
                    key={s.season}
                    className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="num px-4 py-3 font-medium text-neutral-100">{s.season}</td>
                    <td className="num px-4 py-3 text-center text-neutral-200">
                      {s.wins}-{s.losses}
                      {s.ties ? `-${s.ties}` : ''}
                    </td>
                    <td className="num px-4 py-3 text-right text-neutral-300">
                      {s.points_for.toFixed(1)}
                    </td>
                    <td className="num px-4 py-3 text-right text-neutral-500">
                      {s.points_against.toFixed(1)}
                    </td>
                    <td className="hidden md:table-cell num px-4 py-3 text-center text-neutral-400">
                      {s.seed ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PlacementBadge placement={s.final_placement} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-neutral-500 italic">
            No historical standings yet. The Small Council can backfill from Yahoo via the History admin page.
          </p>
        )}
      </div>

      {/* Head-to-head */}
      <h2 className="text-lg font-semibold text-neutral-200 mb-4">Head-to-head, all time</h2>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        {h2h.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Opponent</th>
                  <th className="text-center px-4 py-3 font-medium">Games</th>
                  <th className="text-center px-4 py-3 font-medium">Record</th>
                  <th className="hidden md:table-cell text-right px-4 py-3 font-medium">PF / gm</th>
                  <th className="hidden md:table-cell text-right px-4 py-3 font-medium">PA / gm</th>
                </tr>
              </thead>
              <tbody>
                {h2h.map((row) => (
                  <tr
                    key={row.opponent_id}
                    className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-100">
                      <Link
                        href={`/franchises/${row.opponent_slug}`}
                        className="hover:text-accent transition-colors"
                      >
                        {row.opponent_owner || '(unknown)'}
                      </Link>
                    </td>
                    <td className="num px-4 py-3 text-center text-neutral-400">{row.games}</td>
                    <td className="num px-4 py-3 text-center text-neutral-200">
                      {row.wins}-{row.losses}
                      {row.ties ? `-${row.ties}` : ''}
                    </td>
                    <td className="hidden md:table-cell num px-4 py-3 text-right text-neutral-300">
                      {(row.points_for / row.games).toFixed(1)}
                    </td>
                    <td className="hidden md:table-cell num px-4 py-3 text-right text-neutral-500">
                      {(row.points_against / row.games).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-neutral-500 italic">
            No matchup history yet. Run sync-matchups from the History admin page.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="num text-2xl font-bold text-neutral-100">{value}</div>
      {subtitle && <div className="text-xs text-neutral-500 mt-1">{subtitle}</div>}
    </div>
  );
}
