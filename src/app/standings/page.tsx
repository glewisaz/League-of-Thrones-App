import { Syne } from 'next/font/google';
import { createAnonServerClient } from '@/lib/supabase/server';

export const revalidate = 3600;

export const metadata = {
  title: '2025 Standings · League of Thrones',
};

const syne = Syne({ subsets: ['latin'], weight: ['700', '800'] });

const SEASON = 2025;

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

function wlt(row: StandingRow) {
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
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-3">
          {title} Conference
        </h2>
        <p className="text-sm text-neutral-600 italic">No standings data.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-3">
        {title} Conference
      </h2>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
              <th className="num text-center px-3 py-2 font-medium w-7">#</th>
              <th className="text-left px-3 py-2 font-medium">Team</th>
              <th className="hidden sm:table-cell text-left px-3 py-2 font-medium">Owner</th>
              <th className="num text-center px-3 py-2 font-medium">W-L</th>
              <th className="num text-right px-3 py-2 font-medium">PF</th>
              <th className="hidden sm:table-cell num text-right px-3 py-2 font-medium">PA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const teamId = row.team?.id ?? '';
              const isChamp = teamId === champs?.champion_team_id;
              const isRunnerUp = teamId === champs?.runner_up_team_id;
              const isNorthCrown = teamId === champs?.north_crown_team_id;
              const isSouthCrown = teamId === champs?.south_crown_team_id;
              const isCrownWinner = isNorthCrown || isSouthCrown;

              const rowClass = isChamp
                ? 'border-b border-neutral-800/50 last:border-0 bg-yellow-500/5'
                : isRunnerUp
                  ? 'border-b border-neutral-800/50 last:border-0 bg-cyan-500/5'
                  : 'border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20 transition-colors';

              const teamNameClass = isChamp
                ? 'text-yellow-400 font-semibold'
                : isRunnerUp
                  ? 'text-accent font-medium'
                  : isCrownWinner
                    ? 'text-neutral-100 font-bold'
                    : 'text-neutral-100 font-medium';

              const ownerClass = isChamp
                ? 'text-yellow-400/80'
                : isRunnerUp
                  ? 'text-accent/80'
                  : 'text-neutral-400';

              const teamDisplay = row.team?.name ?? row.team?.owner_name ?? '—';

              return (
                <tr key={row.id} className={rowClass}>
                  <td className="num px-3 py-2.5 text-center text-neutral-600 text-xs">
                    {row.seed ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={teamNameClass}>
                      {isChamp && '👑 '}
                      {teamDisplay}
                    </span>
                  </td>
                  <td className={`hidden sm:table-cell px-3 py-2.5 text-sm ${ownerClass}`}>
                    {row.team?.owner_name ?? '—'}
                  </td>
                  <td className="num px-3 py-2.5 text-center text-neutral-300">
                    {wlt(row)}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-neutral-300">
                    {Number(row.points_for).toFixed(2)}
                  </td>
                  <td className="hidden sm:table-cell num px-3 py-2.5 text-right text-neutral-500">
                    {Number(row.points_against).toFixed(2)}
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

  const [{ data: standingsRaw }, { data: championsRaw }] = await Promise.all([
    supabase
      .from('standings')
      .select('id, wins, losses, ties, points_for, points_against, seed, team:teams(id, name, owner_name, conference)')
      .eq('season', SEASON)
      .order('seed', { ascending: true, nullsFirst: false }),
    supabase
      .from('champions')
      .select('champion_team_id, runner_up_team_id, north_crown_team_id, south_crown_team_id')
      .eq('season', SEASON)
      .maybeSingle(),
  ]);

  const standings = (standingsRaw ?? []) as unknown as StandingRow[];
  const champs = (championsRaw ?? null) as ChampionsRow;

  const north = standings.filter((s) => s.team?.conference === 'north');
  const south = standings.filter((s) => s.team?.conference === 'south');

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <div className="mb-8">
        <h1 className={`${syne.className} text-3xl font-bold text-accent`}>
          {SEASON} Standings
        </h1>
        <p className="text-neutral-500 mt-1 text-sm">Final regular season results</p>
      </div>

      {standings.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-12 text-center">
          <p className="text-sm italic text-neutral-500">
            No standings have been entered for {SEASON}. Run{' '}
            <code className="text-accent">/api/yahoo/sync-standings</code> to populate.
          </p>
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
