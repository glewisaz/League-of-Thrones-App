import Link from 'next/link';
import { Syne } from 'next/font/google';
import { createAnonServerClient } from '@/lib/supabase/server';
import {
  getSingleGameRecords,
  getSeasonRecords,
  getCareerLeaders,
  getLongestStreaks,
  getSeasonTimeline,
  type SingleGameRecord,
} from '@/lib/queries/records';

export const revalidate = 3600;

export const metadata = {
  title: 'The White Book · League of Thrones',
};

const syne = Syne({ subsets: ['latin'], weight: ['700', '800'] });

interface TeamStub {
  name: string | null;
  owner_name: string;
  slug?: string | null;
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

function FranchiseLink({
  owner,
  slug,
  className = '',
}: {
  owner: string;
  slug: string;
  className?: string;
}) {
  return (
    <Link
      href={`/franchises/${slug}`}
      className={`hover:text-yellow-300 transition-colors ${className}`}
    >
      {owner}
    </Link>
  );
}

function SingleGameCard({
  title,
  record,
  badge,
  invert = false,
}: {
  title: string;
  record: SingleGameRecord | null;
  badge?: string;
  invert?: boolean; // for "lowest" / "closest", flip the visual emphasis
}) {
  if (!record) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2">{title}</div>
        <p className="text-sm italic text-neutral-600">No data yet.</p>
      </div>
    );
  }
  const accent = invert ? 'text-red-400' : 'text-yellow-400';
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs text-neutral-500 uppercase tracking-wide">{title}</div>
        {badge && <span className="text-[10px] text-neutral-600">{badge}</span>}
      </div>
      <div className={`num text-3xl font-bold ${accent}`}>
        {record.points_for.toFixed(2)}
      </div>
      <div className="text-sm text-neutral-300 mt-1">
        <FranchiseLink owner={record.team.owner_name} slug={record.team.slug} />
      </div>
      <div className="text-xs text-neutral-500 mt-1">
        vs <FranchiseLink owner={record.opponent.owner_name} slug={record.opponent.slug} />
        {' · '}
        <span className="num">{record.points_against.toFixed(2)}</span>
        {' · '}
        Week {record.week}, {record.season}
        {record.is_playoffs && <span className="ml-1 text-yellow-400/60">(playoffs)</span>}
      </div>
    </div>
  );
}

export default async function RecordBookPage() {
  const supabase = createAnonServerClient();

  const [
    { data: championData, error },
    singleGame,
    seasonRecords,
    careerLeaders,
    streaks,
    timeline,
  ] = await Promise.all([
    supabase
      .from('champions')
      .select(`
        season, notes,
        champion:teams!champions_champion_team_id_fkey(name, owner_name, slug),
        runner_up:teams!champions_runner_up_team_id_fkey(name, owner_name, slug),
        north_crown:teams!champions_north_crown_team_id_fkey(name, owner_name, slug),
        south_crown:teams!champions_south_crown_team_id_fkey(name, owner_name, slug)
      `)
      .order('season', { ascending: false }),
    getSingleGameRecords(),
    getSeasonRecords(5),
    getCareerLeaders(2),
    getLongestStreaks(),
    getSeasonTimeline(),
  ]);

  if (error) throw error;
  const champions = (championData ?? []) as unknown as ChampionRow[];

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
          <span className="text-yellow-400">🏈</span> The Iron Football — Championship History
        </h2>

        {champions.length === 0 ? (
          <p className="text-neutral-600 italic text-sm">No champions recorded yet.</p>
        ) : (
          <>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-medium">Season</th>
                      <th className="text-left px-4 py-3 font-medium">Champion</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Runner-Up</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Notes</th>
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
                          {row.notes && <sup className="ml-0.5 text-yellow-400/70">*</sup>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-yellow-400">
                            {row.champion?.slug ? (
                              <FranchiseLink
                                owner={row.champion.owner_name}
                                slug={row.champion.slug}
                              />
                            ) : (
                              ownerOnly(row.champion)
                            )}
                          </span>
                          {row.champion?.name && (
                            <span className="ml-2 text-xs text-yellow-400/60">{row.champion.name}</span>
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-neutral-400 whitespace-nowrap">
                          {row.runner_up?.slug ? (
                            <FranchiseLink
                              owner={row.runner_up.owner_name}
                              slug={row.runner_up.slug}
                            />
                          ) : (
                            ownerOnly(row.runner_up)
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-neutral-500 text-xs">
                          {row.notes ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {champions.some((r) => r.notes) && (
              <ul className="mt-3 space-y-0.5">
                {[...new Set(champions.filter((r) => r.notes).map((r) => r.notes as string))].map(
                  (note) => (
                    <li key={note} className="text-xs italic text-neutral-600">
                      * {note}
                    </li>
                  ),
                )}
              </ul>
            )}
          </>
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
                  className={`flex items-center gap-4 px-4 py-3 ${isFirst ? 'bg-yellow-400/5' : ''}`}
                >
                  <span className="num w-6 text-sm text-center text-neutral-600 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`font-medium ${isFirst ? 'text-yellow-400' : 'text-neutral-200'}`}>
                      {team.slug ? (
                        <FranchiseLink owner={team.owner_name} slug={team.slug} />
                      ) : (
                        team.owner_name
                      )}
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

      {/* ── Section 3: Single-Game Records ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">⚔️</span> Single-Game Records
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SingleGameCard title="Highest single-week score" record={singleGame.highest_score} />
          <SingleGameCard title="Lowest single-week score" record={singleGame.lowest_score} invert />
          <SingleGameCard
            title="Biggest blowout"
            record={singleGame.biggest_blowout}
            badge={
              singleGame.biggest_blowout
                ? `+${singleGame.biggest_blowout.margin.toFixed(2)}`
                : undefined
            }
          />
          <SingleGameCard
            title="Closest win"
            record={singleGame.closest_game}
            badge={
              singleGame.closest_game
                ? `+${singleGame.closest_game.margin.toFixed(2)}`
                : undefined
            }
            invert
          />
        </div>
      </section>

      {/* ── Section 4: Season Records ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">📜</span> Season Records
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 text-xs text-neutral-500 uppercase tracking-wide">
              Highest season points
            </div>
            {seasonRecords.highest_pf.length === 0 ? (
              <p className="px-4 py-3 text-sm italic text-neutral-600">No data yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-800/50">
                {seasonRecords.highest_pf.map((s, i) => (
                  <li key={`${s.team.id}-${s.season}`} className="flex items-center px-4 py-2.5 text-sm">
                    <span className="num w-5 text-xs text-neutral-600">{i + 1}</span>
                    <span className="flex-1 ml-2 text-neutral-200">
                      <FranchiseLink owner={s.team.owner_name} slug={s.team.slug} />
                      <span className="text-neutral-500 ml-2 num">{s.season}</span>
                    </span>
                    <span className="num font-semibold text-yellow-400">
                      {s.points_for.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 text-xs text-neutral-500 uppercase tracking-wide">
              Best regular-season record
            </div>
            {seasonRecords.best_record.length === 0 ? (
              <p className="px-4 py-3 text-sm italic text-neutral-600">No data yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-800/50">
                {seasonRecords.best_record.map((s, i) => (
                  <li
                    key={`${s.team.id}-${s.season}-r`}
                    className="flex items-center px-4 py-2.5 text-sm"
                  >
                    <span className="num w-5 text-xs text-neutral-600">{i + 1}</span>
                    <span className="flex-1 ml-2 text-neutral-200">
                      <FranchiseLink owner={s.team.owner_name} slug={s.team.slug} />
                      <span className="text-neutral-500 ml-2 num">{s.season}</span>
                    </span>
                    <span className="num font-semibold text-yellow-400">
                      {s.wins}-{s.losses}
                      {s.ties ? `-${s.ties}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── Section 5: Career Leaders ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">⚜️</span> Career Leaders
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { title: 'Most wins', rows: careerLeaders.most_wins, fmt: (s: typeof careerLeaders.most_wins[number]) => `${s.wins}` },
            {
              title: 'Most points',
              rows: careerLeaders.most_points,
              fmt: (s: typeof careerLeaders.most_points[number]) => s.points_for.toFixed(0),
            },
            {
              title: 'Best win pct (2+ seasons)',
              rows: careerLeaders.best_win_pct,
              fmt: (s: typeof careerLeaders.best_win_pct[number]) =>
                s.win_pct.toFixed(3).replace(/^0/, ''),
            },
          ].map(({ title, rows, fmt }) => (
            <div key={title} className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800 text-xs text-neutral-500 uppercase tracking-wide">
                {title}
              </div>
              {rows.length === 0 ? (
                <p className="px-4 py-3 text-sm italic text-neutral-600">No data yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-800/50">
                  {rows.slice(0, 10).map((s, i) => (
                    <li key={s.team.id} className="flex items-center px-4 py-2 text-sm">
                      <span className="num w-5 text-xs text-neutral-600">{i + 1}</span>
                      <span className="flex-1 ml-2 text-neutral-200 truncate">
                        <FranchiseLink owner={s.team.owner_name} slug={s.team.slug} />
                      </span>
                      <span className="num font-semibold text-yellow-400">{fmt(s)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 6: Streaks ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">🔥</span> Longest Streaks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { kind: 'Win', rec: streaks.longest_win, color: 'text-yellow-400' },
            { kind: 'Loss', rec: streaks.longest_loss, color: 'text-red-400' },
          ].map(({ kind, rec, color }) => (
            <div key={kind} className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2">
                Longest {kind} Streak
              </div>
              {rec ? (
                <>
                  <div className={`num text-3xl font-bold ${color}`}>{rec.length}</div>
                  <div className="text-sm text-neutral-300 mt-1">
                    <FranchiseLink owner={rec.team.owner_name} slug={rec.team.slug} />
                  </div>
                  <div className="text-xs text-neutral-500 mt-1 num">
                    {rec.start_season} W{rec.start_week} → {rec.end_season} W{rec.end_week}
                  </div>
                </>
              ) : (
                <p className="text-sm italic text-neutral-600">No data yet.</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 7: Season-by-Season Timeline ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">📅</span> Season by Season
        </h2>
        {timeline.length === 0 ? (
          <p className="text-neutral-600 italic text-sm">No seasons synced yet.</p>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Year</th>
                    <th className="text-left px-4 py-3 font-medium">Champion</th>
                    <th className="hidden md:table-cell text-left px-4 py-3 font-medium">Best record</th>
                    <th className="hidden md:table-cell text-left px-4 py-3 font-medium">Top scorer</th>
                    <th className="hidden lg:table-cell text-left px-4 py-3 font-medium">Top week</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((row) => (
                    <tr
                      key={row.season}
                      className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="num px-4 py-3 text-neutral-300 font-medium">{row.season}</td>
                      <td className="px-4 py-3 text-yellow-400 whitespace-nowrap">
                        {row.champion ? (
                          <FranchiseLink owner={row.champion.owner_name} slug={row.champion.slug} />
                        ) : (
                          <span className="text-neutral-700">—</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-neutral-300 whitespace-nowrap">
                        {row.best_regular_season ? (
                          <>
                            <FranchiseLink
                              owner={row.best_regular_season.team.owner_name}
                              slug={row.best_regular_season.team.slug}
                            />
                            <span className="num text-xs text-neutral-500 ml-1.5">
                              {row.best_regular_season.wins}-{row.best_regular_season.losses}
                              {row.best_regular_season.ties ? `-${row.best_regular_season.ties}` : ''}
                            </span>
                          </>
                        ) : (
                          <span className="text-neutral-700">—</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-neutral-300 whitespace-nowrap">
                        {row.highest_scorer ? (
                          <>
                            <FranchiseLink
                              owner={row.highest_scorer.team.owner_name}
                              slug={row.highest_scorer.team.slug}
                            />
                            <span className="num text-xs text-neutral-500 ml-1.5">
                              {row.highest_scorer.points_for.toFixed(0)} PF
                            </span>
                          </>
                        ) : (
                          <span className="text-neutral-700">—</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-neutral-400 whitespace-nowrap">
                        {row.most_points_week ? (
                          <>
                            <FranchiseLink
                              owner={row.most_points_week.team.owner_name}
                              slug={row.most_points_week.team.slug}
                            />
                            <span className="num text-xs text-neutral-500 ml-1.5">
                              {row.most_points_week.points.toFixed(1)} · W{row.most_points_week.week}
                            </span>
                          </>
                        ) : (
                          <span className="text-neutral-700">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 8: Conference Crowns ── */}
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
