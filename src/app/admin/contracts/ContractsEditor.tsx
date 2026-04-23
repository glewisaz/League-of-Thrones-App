'use client';

import { useState, useMemo } from 'react';
import { nextYearCostFromCurrent, nextYearCost } from '@/lib/contracts';
import type { AcquisitionType, ContractStatus } from '@/types/database';

export type ContractRow = {
  id: string;
  year_one_price: number;
  contract_year: number;
  current_season_cost: number | null;
  acquisition_type: AcquisitionType;
  status: ContractStatus;
  current_team_id: string;
  players: { name: string; position: string | null } | null;
  unmatched_players: { raw_name: string; position: string | null } | null;
};

export type TeamOption = { id: string; name: string | null; owner_name: string };

type EditableFields = Pick<ContractRow, 'current_season_cost' | 'contract_year' | 'acquisition_type' | 'status'>;

const ACQ_TYPES: AcquisitionType[] = ['auction', 'waiver', 'free_agent', 'rookie_draft', 'trade_inherited'];
const STATUSES: ContractStatus[] = ['active', 'dropped', 'expired'];

function teamLabel(t: TeamOption) {
  return t.name ?? t.owner_name;
}

export default function ContractsEditor({
  initialContracts,
  teams,
  seasonYear,
}: {
  initialContracts: ContractRow[];
  teams: TeamOption[];
  seasonYear: number;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id ?? '');
  const [contracts, setContracts] = useState<ContractRow[]>(initialContracts);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [lastSavedCount, setLastSavedCount] = useState(0);

  const teamContracts = useMemo(
    () =>
      contracts
        .filter((c) => c.current_team_id === selectedTeamId)
        .sort((a, b) => {
          const nameA = a.players?.name ?? a.unmatched_players?.raw_name ?? '';
          const nameB = b.players?.name ?? b.unmatched_players?.raw_name ?? '';
          return nameA.localeCompare(nameB);
        }),
    [contracts, selectedTeamId],
  );

  function updateField(id: string, field: keyof EditableFields, value: unknown) {
    setContracts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
    setDirtyIds((prev) => new Set([...prev, id]));
  }

  async function saveChanges() {
    if (dirtyIds.size === 0) return;
    setSaveStatus('saving');
    setSaveError('');

    const toSave = contracts
      .filter((c) => dirtyIds.has(c.id))
      .map(({ id, current_season_cost, acquisition_type, contract_year, status }) => ({
        id,
        current_season_cost,
        acquisition_type,
        contract_year,
        status,
      }));

    try {
      const res = await fetch('/api/admin/contracts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contracts: toSave }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setLastSavedCount(toSave.length);
      setDirtyIds(new Set());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  const totalDirty = dirtyIds.size;

  return (
    <div>
      {/* Team selector */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className="w-full md:w-auto bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-[#e8eaf0] text-sm focus:outline-none focus:border-[#00E5FF]"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {teamLabel(t)}
            </option>
          ))}
        </select>
        <span className="text-neutral-500 text-sm">
          {teamContracts.length} contracts
        </span>
        {totalDirty > 0 && (
          <span className="text-yellow-400 text-sm">
            · {totalDirty} unsaved change{totalDirty !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {saveStatus === 'saved' && (
        <div className="mb-4 p-3 rounded bg-green-900/30 border border-green-800 text-green-400 text-sm">
          Saved {lastSavedCount} contract{lastSavedCount !== 1 ? 's' : ''}.
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-800 text-red-400 text-sm">
          {saveError}
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide whitespace-nowrap">
                <th className="text-left px-3 py-2 font-medium">Player</th>
                <th className="text-left px-3 py-2 font-medium">Pos</th>
                <th className="hidden md:table-cell text-left px-3 py-2 font-medium">Acquisition</th>
                <th className="hidden md:table-cell text-right px-3 py-2 font-medium">Y1 $</th>
                <th className="text-center px-3 py-2 font-medium">Yr</th>
                <th className="text-right px-3 py-2 font-medium">{seasonYear} Cost</th>
                <th className="hidden md:table-cell text-right px-3 py-2 font-medium">Next</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {teamContracts.map((c) => {
                const playerName = c.players?.name ?? c.unmatched_players?.raw_name ?? 'Unknown';
                const position = c.players?.position ?? c.unmatched_players?.position ?? '—';
                const nextCost =
                  c.current_season_cost != null
                    ? nextYearCostFromCurrent(c.current_season_cost, c.contract_year)
                    : nextYearCost(c.year_one_price, c.contract_year);
                const isDirty = dirtyIds.has(c.id);

                return (
                  <tr
                    key={c.id}
                    className={`border-b border-neutral-800/50 last:border-0 ${
                      isDirty ? 'bg-yellow-500/5' : 'hover:bg-neutral-800/20'
                    }`}
                  >
                    <td className="px-3 py-1.5 text-neutral-200 max-w-[150px]">
                      <span className="block truncate" title={playerName}>
                        {playerName}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-neutral-500 text-xs whitespace-nowrap">
                      {position}
                    </td>
                    <td className="hidden md:table-cell px-3 py-1.5">
                      <select
                        value={c.acquisition_type}
                        onChange={(e) =>
                          updateField(c.id, 'acquisition_type', e.target.value as AcquisitionType)
                        }
                        className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[#e8eaf0] text-xs focus:outline-none focus:border-[#00E5FF]"
                      >
                        {ACQ_TYPES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="hidden md:table-cell num px-3 py-1.5 text-right text-neutral-500">
                      ${c.year_one_price}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <select
                        value={c.contract_year}
                        onChange={(e) =>
                          updateField(c.id, 'contract_year', parseInt(e.target.value, 10))
                        }
                        className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[#e8eaf0] text-xs focus:outline-none focus:border-[#00E5FF]"
                      >
                        {[1, 2, 3, 4].map((y) => (
                          <option key={y} value={y}>
                            Y{y}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num px-3 py-1.5 text-right text-neutral-200 whitespace-nowrap">
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={c.current_season_cost ?? ''}
                        onChange={(e) =>
                          updateField(c.id, 'current_season_cost', parseInt(e.target.value, 10) || null)
                        }
                        className="num w-16 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-right text-[#e8eaf0] text-xs focus:outline-none focus:border-[#00E5FF]"
                      />
                    </td>
                    <td className="hidden md:table-cell num px-3 py-1.5 text-right text-neutral-500 whitespace-nowrap">
                      {nextCost != null ? `$${nextCost}` : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={c.status}
                        onChange={(e) =>
                          updateField(c.id, 'status', e.target.value as ContractStatus)
                        }
                        className={`bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#00E5FF] ${
                          c.status === 'active' ? 'text-[#e8eaf0]' : 'text-neutral-500'
                        }`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {teamContracts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-neutral-600">
                    No contracts for this team.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Desktop save bar */}
        <div className="hidden md:flex px-4 py-3 border-t border-neutral-800 items-center justify-between">
          <span className="text-xs text-neutral-600">
            Save applies all unsaved changes across all teams
          </span>
          <button
            onClick={saveChanges}
            disabled={saveStatus === 'saving' || totalDirty === 0}
            className="bg-[#00E5FF] text-[#0a0c10] font-semibold rounded px-6 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saveStatus === 'saving'
              ? 'Saving…'
              : totalDirty > 0
                ? `Save Changes (${totalDirty})`
                : 'Save Changes'}
          </button>
        </div>

        {/* Mobile save bar — fixed above tab bar */}
        <div className="md:hidden fixed bottom-16 inset-x-0 z-40 px-4 py-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between">
          <span className="text-xs text-neutral-600">
            {totalDirty > 0 ? `${totalDirty} unsaved change${totalDirty !== 1 ? 's' : ''}` : 'No changes'}
          </span>
          <button
            onClick={saveChanges}
            disabled={saveStatus === 'saving' || totalDirty === 0}
            className="bg-[#00E5FF] text-[#0a0c10] font-semibold rounded px-6 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
