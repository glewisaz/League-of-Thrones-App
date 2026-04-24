import Link from 'next/link';
import { Syne } from 'next/font/google';
import { createAnonServerClient } from '@/lib/supabase/server';
import { getAllTeams, getAllCapByTeam } from '@/lib/queries/teams';
import { getActiveSeason } from '@/lib/queries/seasons';
import { getLeagueKey, fetchYahooPlayers, yahooPlayerUrl, type YahooPlayer } from '@/lib/yahoo/players';

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

function PlayerList({ players, emptyMessage }: { players: YahooPlayer[]; emptyMessage: string }) {
  if (players.length === 0) {
    return <p className="text-sm italic text-neutral-600">{emptyMessage}</p>;
  }
  return (
    <ol className="divide-y divide-neutral-800/60">
      {players.map((p, i) => (
        <li key={p.playerKey} className="flex items-center gap-3 py-2.5">
          <span className="num text-xs text-neutral-600 w-5 shrink-0 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <a
              href={yahooPlayerUrl(p.playerKey)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-neutral-100 hover:text-accent transition-colors"
            >
              {p.name}
            </a>
            <span className="ml-2 text-xs text-neutral-500">
              {[p.position, p.nflTeam].filter(Boolean).join(' · ')}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function HomePage() {
  const supabase = createAnonServerClient();

  const [season, teams, capByTeam, { data: latestChampion }] = await Promise.all([
    getActiveSeason(),
    getAllTeams(),
    getAllCapByTeam(),
    supabase
      .from('champions')
      .select('season, champion:teams!champions_champion_team_id_fkey(name, owner_name)')
      .order('season', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const auctionCap = season?.auction_cap ?? 200;
  const seasonYear = season?.year ?? new Date().getFullYear();
  const totalCommitted = Object.values(capByTeam).reduce((sum, v) => sum + v, 0);
  const weeksOut = weeksUntilSeason();

  const champion = latestChampion as {
    season: number;
    champion: { name: string | null; owner_name: string } | null;
  } | null;

  // Cap room leaderboard — top 5 teams with the most available cap
  const capLeaderboard = teams
    .map((team) => {
      const committed = capByTeam[team.id] ?? 0;
      const available = auctionCap - committed;
      const pct = Math.min(100, Math.round((committed / auctionCap) * 100));
      return { team, committed, available, pct };
    })
    .sort((a, b) => b.available - a.available)
    .slice(0, 5);

  // Yahoo data — degrades gracefully if Yahoo is unreachable or unconfigured
  let freeAgents: YahooPlayer[] = [];
  let rookies: YahooPlayer[] = [];
  try {
    const leagueKey = await getLeagueKey();
    if (leagueKey) {
      [freeAgents, rookies] = await Promise.all([
        fetchYahooPlayers(leagueKey, 'FA'),
        fetchYahooPlayers(leagueKey, 'R'),
      ]);
    }
  } catch {
    // Yahoo unavailable — sections render with empty state
  }

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

      {/* ── Two-column grid: Cap Room + Free Agents ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">

        {/* Cap Room Leaderboard */}
        <section>
          <h2 className={`${syne.className} text-xl font-bold text-neutral-100 mb-1`}>
            Cap Room Available
          </h2>
          <p className="text-xs text-neutral-500 mb-4">Most flexibility heading into the auction</p>
          <div className="space-y-4">
            {capLeaderboard.map(({ team, committed, available, pct }, i) => (
              <Link
                key={team.id}
                href={`/teams/${team.slug}`}
                className="block group"
              >
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

        {/* Top Free Agents */}
        <section>
          <h2 className={`${syne.className} text-xl font-bold text-neutral-100 mb-1`}>
            Top Free Agents
          </h2>
          <p className="text-xs text-neutral-500 mb-4">Best unrostered players by overall rank</p>
          <PlayerList
            players={freeAgents}
            emptyMessage="Yahoo sync not configured or no free agents available."
          />
        </section>
      </div>

      {/* ── Rookies ── */}
      <section>
        <h2 className={`${syne.className} text-xl font-bold text-neutral-100 mb-1`}>
          Rookie Draft Prospects
        </h2>
        <p className="text-xs text-neutral-500 mb-4">
          Top prospects for the {seasonYear + 1} rookie draft
        </p>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2">
          <PlayerList
            players={rookies}
            emptyMessage="Yahoo sync not configured or rookie list unavailable."
          />
        </div>
      </section>

    </div>
  );
}
