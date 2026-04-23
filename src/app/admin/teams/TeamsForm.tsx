'use client';

import { useState } from 'react';

export type TeamRow = {
  id: string;
  name: string | null;
  owner_name: string;
  conference: string | null;
};

export default function TeamsForm({ initialTeams }: { initialTeams: TeamRow[] }) {
  const [teams, setTeams] = useState<TeamRow[]>(initialTeams);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function update(id: string, field: 'owner_name' | 'conference', value: string) {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  async function saveAll() {
    setStatus('saving');
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teams: teams.map(({ id, owner_name, conference }) => ({ id, owner_name, conference })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <>
      {status === 'saved' && (
        <div className="mx-4 mt-4 p-3 rounded bg-green-900/30 border border-green-800 text-green-400 text-sm">
          All teams saved.
        </div>
      )}
      {status === 'error' && (
        <div className="mx-4 mt-4 p-3 rounded bg-red-900/30 border border-red-800 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-3 font-medium">Yahoo Team Name</th>
            <th className="text-left px-4 py-3 font-medium">Owner Name</th>
            <th className="text-left px-4 py-3 font-medium">Conference</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id} className="border-b border-neutral-800/50 last:border-0">
              <td className="px-4 py-3 text-neutral-400">{team.name ?? '—'}</td>
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={team.owner_name}
                  onChange={(e) => update(team.id, 'owner_name', e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-[#e8eaf0] text-sm focus:outline-none focus:border-[#00E5FF]"
                />
              </td>
              <td className="px-4 py-2">
                <select
                  value={team.conference ?? ''}
                  onChange={(e) => update(team.id, 'conference', e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-[#e8eaf0] text-sm focus:outline-none focus:border-[#00E5FF]"
                >
                  <option value="">Unassigned</option>
                  <option value="north">North</option>
                  <option value="south">South</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="px-4 py-4 flex justify-end border-t border-neutral-800">
        <button
          onClick={saveAll}
          disabled={status === 'saving'}
          className="bg-[#00E5FF] text-[#0a0c10] font-semibold rounded px-6 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Save All'}
        </button>
      </div>
    </>
  );
}
