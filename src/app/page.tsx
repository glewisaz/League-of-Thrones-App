import Link from 'next/link';
import { Syne } from 'next/font/google';
import { createAnonServerClient } from '@/lib/supabase/server';
import { getAllTeams, getAllCapByTeam } from '@/lib/queries/teams';
import { getActiveSeason } from '@/lib/queries/seasons';
import { getDynastyFreeAgents, type DynastyFreeAgent } from '@/lib/queries/dynasty';
import { fetchRookies, type SleeperRookie } from '@/lib/sleeper/rookies';

export const revalidate = 1800;

const syne = Syne({ subsets: ['latin'], weight: ['700', '800'] });

function weeksUntilSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  let target = new Date(`${year}-09-01T00:00:00`);
  if (target <= now) target = new Date(`${year + 1}-09-01T00:00:00`);
  return Math.ceil((target.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function CapBar({ pct }: { pct: number }) {
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-400' : 'bg-accent';
  return (
    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mt-2">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const POSITION_BADGE: Record<string, string> = {
  QB: 'bg-red-900/60 text-red-300',
  RB: 'bg-green-900/60 text-green-300',
  WR: 'bg-blue-900/60 text-blue-300',
  TE: 'bg-purple-900/60 text-purple-300',
};

function FreeAgentColumn({ position, players }: { position: string; players: DynastyFreeAgent[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POSITION_BADGE[position] ?? 'bg-neutral-800 text-neutral-400'}`}
        >
          {position}
        </span>
      </div>
      {players.length === 0 ? (
        <p className="text-xs italic text-neutral-700">No rankings loaded</p>
      ) : (
        <ol className="space-y-2">
          {players.map((p, i) => (
            <li key={`${p.player_name}-${i}`} className="flex items-baseline gap-2">
              <span className="num text-[11px] text-neutral-600 w-4 shrink-0 text-right">{p.rank}</span>
              <span className="text-sm text-neutral-200 leading-snug">{p.player_name}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RookieList({ rookies }: { rookies: SleeperRookie[] }) {
  if (rookies.length === 0) {
    return <p className="text-sm italic text-neutral-600">Sleeper data unavailable.</p>;
  }
  return (
    <ol className="divide-y divide-neutral-800/60">
      {rookies.map((r, i) => (
        <li key={`${r.name}-${i}`} className="flex items-center gap-3 py-2.5">
          <span className="num text-xs text-neutral-600 w-5 shrink-0 text-right">{i + 1}</span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${POSITION_BADGE[r.position] ?? 'bg-neutral-800 text-neutral-400'}`}
          >
            {r.position}
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-neutral-100">{r.name}</span>
            {r.team && <span className="ml-2 text-xs text-neutral-500">{r.team}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function HomePage() {
  const supabase = createAnonServerClient();

  const [season, teams, capByTeam, { data: latestChampion }, freeAgents, rookies] =
    await Promise.all([
      getActiveSeason(),
      getAllTeams(),
      getAllCapByTeam(),
      supabase
        .from('champions')
        .select('season, champion:teams!champions_champion_team_id_fkey(name, owner_name)')
        .order('season', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getDynastyFreeAgents(5).catch(() => ({ QB: [], RB: [], WR: [], TE: [] })),
      fetchRookies().catch(() => [] as SleeperRookie[]),
    ]);

  const auctionCap = season?.auction_cap ?? 200;
  const seasonYear = season?.year ?? new Date().getFullYear();
  const totalCommitted = Object.values(capByTeam).reduce((sum, v) => sum + v, 0);
  const weeksOut = weeksUntilSeason();

  const champion = latestChampion as {
    season: number;
    champion: { name: string | null; owner_name: string } | null;
  } | null;

  const capLeaderboard = teams
    .map((team) => {
      const committed = capByTeam[team.id] ?? 0;
      const available = auctionCap - committed;
      const pct = Math.min(100, Math.round((committed / auctionCap) * 100));
      return { team, committed, available, pct };
    })
    .sort((a, b) => b.available - a.available)
    .slice(0, 5);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14">

      {/* ── Hero ── */}
      <section className="mb-12">
        <h1 className={`${syne.className} text-4xl md:text-5xl font-bold text-accent leading-tight`}>
          League of Thrones
        </h1>
        <p className="text-neutral-400 mt-2 text-base md:text-lg">
          Dynasty Fantasy Football · {seasonYear} Offseason
        </p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {champion?.champion && (
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">Iron Football</span>
              <span className="text-yellow-400 font-medium">
                👑 {champion.champion.owner_name}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">Kickoff in</span>
            <span className="num font-medium text-neutral-200">{weeksOut} weeks</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">Total cap committed</span>
            <span className="num font-medium text-neutral-200">${totalCommitted}</span>
          </div>
        </div>
      </section>

      {/* ── Cap Room ── */}
      <section className="mb-10">
        <h2 className={`${syne.className} text-xl font-bold text-neutral-100 mb-1`}>
          Cap Room Available
        </h2>
        <p className="text-xs text-neutral-500 mb-4">Most flexibility heading into the auction</p>
        <div className="space-y-4 max-w-sm">
          {capLeaderboard.map(({ team, committed, available, pct }, i) => (
            <Link key={team.id} href={`/teams/${team.slug}`} className="block group">
              <div className="flex items-center gap-3">
                <span className="num text-xs text-neutral-600 w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-neutral-100 group-hover:text-accent transition-colors truncate">
                      {team.name ?? team.owner_name}
                    </span>
                    <span className="num text-accent font-semibold shrink-0">${available}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="num text-xs text-neutral-600">${committed} used</span>
                    <span className="text-neutral-700 text-xs">·</span>
                    <span className="num text-xs text-neutral-600">{pct}%</span>
                  </div>
                  <CapBar pct={pct} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Dynasty Free Agents ── */}
      <section className="mb-10">
        <h2 className={`${syne.className} text-xl font-bold text-neutral-100 mb-1`}>
          Top Free Agents
        </h2>
        <p className="text-xs text-neutral-500 mb-4">
          Best unrostered players by dynasty rank
        </p>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          {(['QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
            <FreeAgentColumn key={pos} position={pos} players={freeAgents[pos]} />
          ))}
        </div>
      </section>

      {/* ── Rookies ── */}
      <section>
        <h2 className={`${syne.className} text-xl font-bold text-neutral-100 mb-1`}>
          Rookie Draft Prospects
        </h2>
        <p className="text-xs text-neutral-500 mb-4">
          Top prospects for the {seasonYear + 1} rookie draft
        </p>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2">
          <RookieList rookies={rookies} />
        </div>
      </section>

    </div>
  );
}
