'use client';

import { useState } from 'react';

export type PickRow = {
  id: string;
  season: number;
  round: number;
  pick_number: number | null;
  original_team_id: string;
  current_team_id: string;
  pick_type: 'rookie' | 'supplemental';
  is_used: boolean;
  notes: string | null;
  original_team: { id: string; name: string | null; owner_name: string } | null;
  current_team: { id: string; name: string | null; owner_name: string } | null;
};

export type TeamOption = { id: string; name: string | null; owner_name: string };

function teamLabel(t: TeamOption) {
  return t.name ?? t.owner_name;
}

function pickLabel(row: PickRow) {
  const orig = row.original_team;
  return orig ? `${orig.name ?? orig.owner_name} pick` : 'Unknown pick';
}

type SeasonStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function PicksEditor({
  initialPicks,
  teams,
}: {
  initialPicks: PickRow[];
  teams: TeamOption[];
}) {
  const [picks, setPicks] = useState<PickRow[]>(initialPicks);
  const [seasonStatus, setSeasonStatus] = useState<Record<number, SeasonStatus>>({});
  const [seasonError, setSeasonError] = useState<Record<number, string>>({});
  const [addingFor, setAddingFor] = useState<Record<number, boolean>>({});
  const [supplementalTeam, setSupplementalTeam] = useState<Record<number, string>>({});

  const seasons = [...new Set(picks.map((p) => p.season))].sort();

  function updateCurrentTeam(id: string, current_team_id: string) {
    setPicks((prev) => prev.map((p) => (p.id === id ? { ...p, current_team_id } : p)));
  }

  async function saveSection(season: number) {
    const sectionPicks = picks.filter((p) => p.season === season);
    setSeasonStatus((s) => ({ ...s, [season]: 'saving' }));
    setSeasonError((s) => ({ ...s, [season]: '' }));

    try {
      const res = await fetch('/api/admin/picks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picks: sectionPicks.map(({ id, current_team_id }) => ({ id, current_team_id })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setSeasonStatus((s) => ({ ...s, [season]: 'saved' }));
      setTimeout(() => setSeasonStatus((s) => ({ ...s, [season]: 'idle' })), 3000);
    } catch (err) {
      setSeasonStatus((s) => ({ ...s, [season]: 'error' }));
      setSeasonError((s) => ({
        ...s,
        [season]: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }

  async function addSupplemental(season: number) {
    const original_team_id = supplementalTeam[season] ?? teams[0]?.id;
    if (!original_team_id) return;

    try {
      const res = await fetch('/api/admin/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, original_team_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to add pick');

      const origTeam = teams.find((t) => t.id === original_team_id) ?? null;
      const newPick: PickRow = {
        id: json.id,
        season,
        round: 1,
        pick_number: null,
        original_team_id,
        current_team_id: original_team_id,
        pick_type: 'supplemental',
        is_used: false,
        notes: null,
        original_team: origTeam,
        current_team: origTeam,
      };

      setPicks((prev) => [...prev, newPick]);
      setAddingFor((a) => ({ ...a, [season]: false }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error adding pick');
    }
  }

  return (
    <div className="space-y-10">
      {seasons.map((season) => {
        const sectionPicks = picks.filter((p) => p.season === season);
        const status = seasonStatus[season] ?? 'idle';
        const err = seasonError[season];
        const isAddingSupp = addingFor[season] ?? false;

        return (
          <div key={season}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#e8eaf0]">{season} Draft Picks</h2>
              <span className="text-xs text-neutral-500">
                {sectionPicks.length} pick{sectionPicks.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
              {status === 'saved' && (
                <div className="mx-4 mt-3 p-2 rounded bg-green-900/30 border border-green-800 text-green-400 text-sm">
                  Saved.
                </div>
              )}
              {status === 'error' && err && (
                <div className="mx-4 mt-3 p-2 rounded bg-red-900/30 border border-red-800 text-red-400 text-sm">
                  {err}
                </div>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Pick</th>
                    <th className="text-left px-4 py-3 font-medium">Current Owner</th>
                    <th className="text-center px-4 py-3 font-medium">Pick #</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-center px-4 py-3 font-medium">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionPicks.map((pick) => (
                    <tr
                      key={pick.id}
                      className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20"
                    >
                      <td className="px-4 py-3 text-neutral-200 font-medium">
                        {pickLabel(pick)}
                      </td>
                      <td className="px-4 py-2">
                        {pick.is_used ? (
                          <span className="text-neutral-500">
                            {pick.current_team?.name ?? pick.current_team?.owner_name ?? '—'}
                          </span>
                        ) : (
                          <select
                            value={pick.current_team_id}
                            onChange={(e) => updateCurrentTeam(pick.id, e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-[#e8eaf0] text-sm focus:outline-none focus:border-[#00E5FF]"
                          >
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {teamLabel(t)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-center text-neutral-500">
                        {pick.pick_number ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            pick.pick_type === 'supplemental'
                              ? 'text-yellow-400 text-xs font-medium'
                              : 'text-neutral-500 text-xs'
                          }
                        >
                          {pick.pick_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {pick.is_used ? (
                          <span className="text-red-400 text-xs font-medium">Used</span>
                        ) : (
                          <span className="text-neutral-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add supplemental pick inline form */}
              {isAddingSupp && (
                <div className="px-4 py-3 border-t border-neutral-800 flex items-center gap-3">
                  <span className="text-sm text-neutral-400">Add supplemental for:</span>
                  <select
                    value={supplementalTeam[season] ?? teams[0]?.id ?? ''}
                    onChange={(e) =>
                      setSupplementalTeam((s) => ({ ...s, [season]: e.target.value }))
                    }
                    className="bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-[#e8eaf0] text-sm focus:outline-none focus:border-[#00E5FF]"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => addSupplemental(season)}
                    className="bg-[#00E5FF] text-[#0a0c10] font-semibold rounded px-4 py-1.5 text-sm hover:opacity-90 transition-opacity"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingFor((a) => ({ ...a, [season]: false }))}
                    className="text-sm text-neutral-500 hover:text-neutral-300"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between">
                <button
                  onClick={() => setAddingFor((a) => ({ ...a, [season]: true }))}
                  className="text-sm text-[#00E5FF] hover:opacity-80 transition-opacity"
                >
                  + Add supplemental pick
                </button>
                <button
                  onClick={() => saveSection(season)}
                  disabled={status === 'saving'}
                  className="bg-[#00E5FF] text-[#0a0c10] font-semibold rounded px-5 py-1.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {status === 'saving' ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {seasons.length === 0 && (
        <div className="text-neutral-500 text-sm py-8 text-center">
          No picks found.{' '}
          <a href="/api/admin/picks/seed" className="text-[#00E5FF] hover:underline">
            Run the seed route
          </a>{' '}
          to create the initial 36 picks.
        </div>
      )}
    </div>
  );
}
