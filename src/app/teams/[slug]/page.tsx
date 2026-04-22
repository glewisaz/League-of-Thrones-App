import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getTeamBySlug,
  getTeamRoster,
  getDraftPicksForTeam,
  getActiveAuctionCap,
} from '@/lib/queries/teams';

const POSITION_ORDER: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 6 };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const [roster, picks, auctionCap] = await Promise.all([
    getTeamRoster(team.id),
    getDraftPicksForTeam(team.id),
    getActiveAuctionCap(),
  ]);

  const sorted = [...roster].sort(
    (a, b) =>
      (POSITION_ORDER[a.position ?? ''] ?? 7) - (POSITION_ORDER[b.position ?? ''] ?? 7) ||
      b.current_year_cost - a.current_year_cost,
  );

  const totalCommitted = roster.reduce((sum, r) => sum + r.current_year_cost, 0);
  const capPct = Math.min(100, Math.round((totalCommitted / auctionCap) * 100));

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <nav className="text-sm text-neutral-500 mb-6">
        <Link href="/" className="hover:text-neutral-300 transition-colors">
          Teams
        </Link>
        <span className="mx-2 text-neutral-700">/</span>
        <span className="text-neutral-300">{team.owner_name}</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-amber-400">{team.owner_name}</h1>
        {team.name && <p className="text-neutral-400 mt-1">{team.name}</p>}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 mb-8">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-medium text-neutral-300">2025 Cap Commitment</span>
          <span className="text-sm font-mono text-neutral-300">
            ${totalCommitted}{' '}
            <span className="text-neutral-600">/ ${auctionCap}</span>
          </span>
        </div>
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              capPct > 90 ? 'bg-red-500' : capPct > 70 ? 'bg-amber-500' : 'bg-amber-400'
            }`}
            style={{ width: `${capPct}%` }}
          />
        </div>
        <p className="text-xs text-neutral-600 mt-1.5">
          {roster.length} players · {capPct}% of cap
        </p>
      </div>

      <h2 className="text-lg font-semibold text-neutral-200 mb-4">Roster</h2>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Player</th>
              <th className="text-left px-4 py-3 font-medium">Pos</th>
              <th className="text-center px-4 py-3 font-medium">Yr</th>
              <th className="text-right px-4 py-3 font-medium">This Year</th>
              <th className="text-right px-4 py-3 font-medium">Next Year</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-neutral-100">
                  {entry.player_name}
                  {entry.is_expiring && (
                    <span className="ml-2 text-xs text-red-400 font-normal">expiring</span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-400">{entry.position ?? '—'}</td>
                <td className="px-4 py-3 text-center text-neutral-500">Y{entry.contract_year}</td>
                <td className="px-4 py-3 text-right font-mono text-neutral-200">
                  ${entry.current_year_cost}
                </td>
                <td className="px-4 py-3 text-right font-mono text-neutral-500">
                  {entry.next_year_cost != null ? `$${entry.next_year_cost}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {picks.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-neutral-200 mb-4">Draft Picks</h2>
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Season</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((pick) => (
                  <tr
                    key={pick.id}
                    className="border-b border-neutral-800/50 last:border-0"
                  >
                    <td className="px-4 py-3 text-neutral-300">{pick.season}</td>
                    <td className="px-4 py-3 text-neutral-400 capitalize">{pick.pick_type}</td>
                    <td className="px-4 py-3 text-neutral-500">{pick.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
