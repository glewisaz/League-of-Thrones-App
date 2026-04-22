import Link from 'next/link';
import { getAllTeams, getAllCapByTeam, getActiveAuctionCap } from '@/lib/queries/teams';

export default async function HomePage() {
  const [teams, capByTeam, auctionCap] = await Promise.all([
    getAllTeams(),
    getAllCapByTeam(),
    getActiveAuctionCap(),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-accent">The Iron Throne</h1>
        <p className="text-neutral-500 mt-1 text-sm">
          2025 Season · {teams.length} teams · <span className="num">${auctionCap}</span> auction cap
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => {
          const committed = capByTeam[team.id] ?? 0;
          const pct = Math.min(100, Math.round((committed / auctionCap) * 100));
          return (
            <Link
              key={team.id}
              href={`/teams/${team.slug}`}
              className="block bg-neutral-900 border border-neutral-800 rounded-lg p-5 hover:border-accent/30 hover:bg-neutral-800/60 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-neutral-100 group-hover:text-accent transition-colors">
                    {team.owner_name}
                  </p>
                  {team.name && (
                    <p className="text-xs text-neutral-500 mt-0.5">{team.name}</p>
                  )}
                </div>
                <span className="num text-sm text-neutral-400">${committed}</span>
              </div>
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-400' : 'bg-accent'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="num text-xs text-neutral-600 mt-1.5">
                ${committed} / ${auctionCap} committed
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
