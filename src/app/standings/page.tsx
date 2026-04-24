import { createAnonServerClient } from '@/lib/supabase/server';
import { getActiveSeason } from '@/lib/queries/seasons';

export const revalidate = 3600;

export const metadata = {
  title: 'Standings · League of Thrones',
};

type StandingRow = {
  id: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  seed: number | null;
  team: {
    id: string;
    name: string | null;
    owner_name: string;
    conference: 'north' | 'south' | null;
  } | null;
};

type ChampionsRow = {
  champion_team_id: string | null;
  runner_up_team_id: string | null;
  north_crown_team_id: string | null;
  south_crown_team_id: string | null;
} | null;

function wl(row: StandingRow) {
  return row.ties > 0
    ? `${row.wins}-${row.losses}-${row.ties}`
    : `${row.wins}-${row.losses}`;
}

function ConferenceTable({
  title,
  rows,
  champs,
}: {
  title: string;
  rows: StandingRow[];
  champs: ChampionsRow;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h2 className="text-base font-semibold text-neutral-300 mb-3">{title}</h2>
        <p className="text-sm text-neutral-600 italic">No standings data.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-neutral-300 mb-3">{title}</h2>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
              <th className="text-center px-3 py-2 font-medium w-8">#</th>
              <th className="text-left px-3 py-2 font-medium">Team</th>
              <th className="num text-center px-3 py-2 font-medium">W-L</th>
              <th className="num text-right px-3 py-2 font-medium">PF</th>
              <th className="hidden sm:table-cell num text-right px-3 py-2 font-medium">PA</th>
              <th className="hidden sm:table-cell text-left px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const teamId = row.team?.id ?? '';
              const isChamp = teamId === champs?.champion_team_id;
              const isRunnerUp = teamId === champs?.runner_up_team_id;
              const isNorthCrown = teamId === champs?.north_crown_team_id;
              const isSouthCrown = teamId === champs?.south_crown_team_id;

              const notes: string[] = [];
              if (isChamp) notes.push('🏆 Champion');
              else if (isRunnerUp) notes.push('Runner-up');
              if (isNorthCrown) notes.push('👑 North Crown');
              if (isSouthCrown) notes.push('👑 South Crown');

              const rowClass = isChamp
                ? 'border-b border-neutral-800/50 last:border-0 bg-yellow-500/5'
                : isRunnerUp
                  ? 'border-b border-neutral-800/50 last:border-0 bg-cyan-500/5'
                  : 'border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20 transition-colors';

              const nameClass = isChamp
                ? 'font-medium text-yellow-400'
                : isRunnerUp
                  ? 'font-medium text-accent'
                  : 'font-medium text-neutral-100';

              return (
                <tr key={row.id} className={rowClass}>
                  <td className="num px-3 py-2.5 text-center text-neutral-600 text-xs">
                    {row.seed ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={nameClass}>
                      {row.team?.owner_name ?? '—'}
                    </span>
                    {row.team?.name && (
                      <span className="block text-xs text-neutral-500">{row.team.name}</span>
                    )}
                  </td>
                  <td className="num px-3 py-2.5 text-center text-neutral-300">{wl(row)}</td>
                  <td className="num px-3 py-2.5 text-right text-neutral-300">
                    {Number(row.points_for).toFixed(2)}
                  </td>
                  <td className="hidden sm:table-cell num px-3 py-2.5 text-right text-neutral-500">
                    {Number(row.points_against).toFixed(2)}
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-neutral-400">
                    {notes.join(' · ') || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function StandingsPage() {
  const supabase = createAnonServerClient();
  const season = await getActiveSeason();
  const seasonYear = season?.year ?? new Date().getFullYear();

  const [{ data: standingsRaw }, { data: championsRaw }] = await Promise.all([
    supabase
      .from('standings')
      .select('id, wins, losses, ties, points_for, points_against, seed, team:teams(id, name, owner_name, conference)')
      .eq('season', seasonYear)
      .order('seed', { ascending: true, nullsFirst: false }),
    supabase
      .from('champions')
      .select('champion_team_id, runner_up_team_id, north_crown_team_id, south_crown_team_id')
      .eq('season', seasonYear)
      .maybeSingle(),
  ]);

  const standings = (standingsRaw ?? []) as unknown as StandingRow[];
  const champs = (championsRaw ?? null) as ChampionsRow;

  const north = standings.filter((s) => s.team?.conference === 'north');
  const south = standings.filter((s) => s.team?.conference === 'south');

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-accent">Standings</h1>
        <p className="text-neutral-500 mt-1 text-sm">{seasonYear} Season · final results</p>
      </div>

      {standings.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-12 text-center">
          <p className="text-sm italic text-neutral-500">No standings have been entered for {seasonYear}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ConferenceTable title="North" rows={north} champs={champs} />
          <ConferenceTable title="South" rows={south} champs={champs} />
        </div>
      )}
    </div>
  );
}
