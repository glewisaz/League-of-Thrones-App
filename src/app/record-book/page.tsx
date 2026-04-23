import { Syne } from 'next/font/google';
import { createAnonServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'The White Book · League of Thrones',
};

const syne = Syne({ subsets: ['latin'], weight: ['700', '800'] });

interface TeamStub {
  name: string | null;
  owner_name: string;
}

interface ChampionRow {
  season: number;
  notes: string | null;
  champion: TeamStub | null;
  runner_up: TeamStub | null;
  north_crown: TeamStub | null;
  south_crown: TeamStub | null;
}

function teamLabel(t: TeamStub | null): string {
  if (!t) return '—';
  return t.name ? `${t.name} (${t.owner_name})` : t.owner_name;
}

function ownerOnly(t: TeamStub | null): string {
  return t?.owner_name ?? '—';
}

export default async function RecordBookPage() {
  const supabase = createAnonServerClient();

  const { data, error } = await supabase
    .from('champions')
    .select(`
      season, notes,
      champion:teams!champions_champion_team_id_fkey(name, owner_name),
      runner_up:teams!champions_runner_up_team_id_fkey(name, owner_name),
      north_crown:teams!champions_north_crown_team_id_fkey(name, owner_name),
      south_crown:teams!champions_south_crown_team_id_fkey(name, owner_name)
    `)
    .order('season', { ascending: false });

  if (error) throw error;
  const champions = (data ?? []) as unknown as ChampionRow[];

  // All-time trophy count
  const trophyMap = new Map<string, { team: TeamStub; wins: number }>();
  for (const row of champions) {
    if (!row.champion) continue;
    const key = row.champion.owner_name;
    if (!trophyMap.has(key)) trophyMap.set(key, { team: row.champion, wins: 0 });
    trophyMap.get(key)!.wins++;
  }
  const ranked = [...trophyMap.values()].sort((a, b) => b.wins - a.wins);
  const maxWins = ranked[0]?.wins ?? 0;

  // Conference crowns — only rows where at least one crown exists
  const crownRows = [...champions]
    .filter((r) => r.north_crown || r.south_crown)
    .sort((a, b) => b.season - a.season);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className={`${syne.className} text-4xl md:text-5xl font-extrabold text-yellow-400 tracking-tight`}>
          The White Book
        </h1>
        <p className="text-neutral-500 mt-2 text-sm">League of Thrones · all-time records</p>
      </div>

      {/* ── Section 1: Championship History ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">⚽</span> The Iron Football — Championship History
        </h2>

        {champions.length === 0 ? (
          <p className="text-neutral-600 italic text-sm">No champions recorded yet.</p>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Season</th>
                    <th className="text-left px-4 py-3 font-medium">Champion</th>
                    <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Runner-Up</th>
                    <th className="hidden md:table-cell text-left px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {champions.map((row) => (
                    <tr
                      key={row.season}
                      className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="num px-4 py-3 text-neutral-400 font-medium whitespace-nowrap">
                        {row.season}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-yellow-400">
                          {ownerOnly(row.champion)}
                        </span>
                        {row.champion?.name && (
                          <span className="ml-2 text-xs text-yellow-400/60">
                            {row.champion.name}
                          </span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-neutral-400 whitespace-nowrap">
                        {ownerOnly(row.runner_up)}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-neutral-500 text-xs">
                        {row.notes ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 2: All-Time Trophy Count ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">🏆</span> All-Time Trophy Count
        </h2>

        {ranked.length === 0 ? (
          <p className="text-neutral-600 italic text-sm">No data yet.</p>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg divide-y divide-neutral-800/60">
            {ranked.map(({ team, wins }, i) => {
              const isLeader = wins === maxWins;
              const isFirst = i === 0;
              return (
                <div
                  key={team.owner_name}
                  className={`flex items-center gap-4 px-4 py-3 ${
                    isFirst ? 'bg-yellow-400/5' : ''
                  }`}
                >
                  <span className="num w-6 text-sm text-center text-neutral-600 shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`font-medium ${
                        isFirst ? 'text-yellow-400' : 'text-neutral-200'
                      }`}
                    >
                      {team.owner_name}
                    </span>
                    {team.name && (
                      <span className="ml-2 text-xs text-neutral-600">{team.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isLeader && <span aria-label="leader">👑</span>}
                    <span
                      className={`num font-semibold text-sm ${
                        isFirst ? 'text-yellow-400' : 'text-neutral-400'
                      }`}
                    >
                      {wins} {wins === 1 ? 'title' : 'titles'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 3: Conference Crowns ── */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">♛</span> Conference Crowns
        </h2>

        {crownRows.length === 0 ? (
          <p className="text-neutral-600 italic text-sm">No conference crown data recorded yet.</p>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Season</th>
                    <th className="text-left px-4 py-3 font-medium">North Crown</th>
                    <th className="text-left px-4 py-3 font-medium">South Crown</th>
                  </tr>
                </thead>
                <tbody>
                  {crownRows.map((row) => (
                    <tr
                      key={row.season}
                      className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="num px-4 py-3 text-neutral-400 font-medium">{row.season}</td>
                      <td className="px-4 py-3 text-neutral-300">{teamLabel(row.north_crown)}</td>
                      <td className="px-4 py-3 text-neutral-300">{teamLabel(row.south_crown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
