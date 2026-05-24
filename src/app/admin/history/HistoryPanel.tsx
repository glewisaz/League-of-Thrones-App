'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type SeasonStatus = {
  season: number;
  is_active: boolean;
  league_key: string | null;
  league_name: string | null;
  num_teams: number | null;
  teams_mapped: number;
  standings_count: number;
  matchups_count: number;
  roster_count: number;
  has_champion: boolean;
  last_synced_at: string | null;
  taken_team_ids: string[];
};

type Team = { id: string; owner_name: string };

type UnresolvedYahoo = {
  yahoo: {
    yahooTeamKey: string;
    yahooTeamName: string;
    manager: string | null;
  };
  matched_team_id: string | null;
  matched_owner_name: string | null;
  match_kind: 'exact' | 'loose' | null;
};

type ActionId = 'teams' | 'standings' | 'matchups' | 'champions' | 'rosters';

const ACTION_LABELS: Record<ActionId, string> = {
  teams: 'Map Teams',
  standings: 'Standings',
  matchups: 'Matchups',
  champions: 'Champion',
  rosters: 'Rosters',
};

const ACTION_ENDPOINTS: Record<ActionId, (season: number) => string> = {
  teams: (s) => `/api/yahoo/sync-teams-season?season=${s}`,
  standings: (s) => `/api/yahoo/sync-standings-season?season=${s}`,
  matchups: (s) => `/api/yahoo/sync-matchups?season=${s}`,
  champions: (s) => `/api/yahoo/sync-champions?season=${s}`,
  rosters: (s) => `/api/yahoo/sync-historical-rosters?season=${s}`,
};

function StatusDot({ ok, count }: { ok: boolean; count?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        ok ? 'text-green-400' : 'text-neutral-600'
      }`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          ok ? 'bg-green-400' : 'bg-neutral-700'
        }`}
      />
      {count != null ? <span className="num">{count}</span> : null}
    </span>
  );
}

function ResolveConflicts({
  season,
  unresolved,
  takenTeamIds,
  allTeams,
  onDone,
}: {
  season: number;
  unresolved: UnresolvedYahoo[];
  takenTeamIds: string[];
  allTeams: Team[];
  onDone: (msg: string, ok: boolean) => void;
}) {
  // map yahoo_team_key -> chosen team_id (or '' for unset)
  const [picks, setPicks] = useState<Record<string, string>>({});
  // Ghost franchises created during this session — added to the dropdown
  // options on top of the server-provided allTeams list.
  const [extraTeams, setExtraTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingGhostFor, setCreatingGhostFor] = useState<string | null>(null);
  const router = useRouter();

  const teamPool = [...allTeams, ...extraTeams];
  const chosenIds = Object.values(picks).filter(Boolean);

  function availableFor(currentKey: string): Team[] {
    return teamPool.filter((t) => {
      if (takenTeamIds.includes(t.id)) return false;
      // Don't show team_ids picked in another dropdown on this form,
      // unless it's the current row's own pick.
      if (chosenIds.includes(t.id) && picks[currentKey] !== t.id) return false;
      return true;
    });
  }

  async function createGhost(u: UnresolvedYahoo) {
    const ownerGuess = u.yahoo.manager?.trim() || u.yahoo.yahooTeamName;
    if (!ownerGuess) {
      onDone('No manager name available to seed a ghost from', false);
      return;
    }
    setCreatingGhostFor(u.yahoo.yahooTeamKey);
    try {
      const res = await fetch('/api/admin/teams/ghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_name: ownerGuess, name: u.yahoo.yahooTeamName }),
      });
      const data = await res.json();
      if (!res.ok) {
        onDone(data.error ?? 'Ghost creation failed', false);
        return;
      }
      const newTeam: Team = {
        id: data.team.id,
        owner_name: data.team.owner_name,
      };
      setExtraTeams((prev) => [...prev, newTeam]);
      setPicks((prev) => ({ ...prev, [u.yahoo.yahooTeamKey]: newTeam.id }));
    } catch {
      onDone('Network error creating ghost', false);
    } finally {
      setCreatingGhostFor(null);
    }
  }

  async function save() {
    const mappings = Object.fromEntries(
      Object.entries(picks).filter(([, v]) => v),
    );
    if (Object.keys(mappings).length === 0) {
      onDone('Pick at least one franchise before saving.', false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/yahoo/sync-teams-season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, mappings }),
      });
      const data = await res.json();
      if (!res.ok) {
        onDone(data.error ?? 'Save failed', false);
      } else {
        onDone(`${data.written} mappings saved`, true);
        router.refresh();
      }
    } catch {
      onDone('Network error', false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 bg-neutral-950/60 border border-yellow-500/30 rounded p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-sm font-semibold text-yellow-300">
          Resolve {unresolved.length} team{unresolved.length === 1 ? '' : 's'}
        </h4>
        <span className="text-xs text-neutral-500">
          {allTeams.length - takenTeamIds.length - chosenIds.length} franchises remaining
        </span>
      </div>
      <div className="space-y-2">
        {unresolved.map((u) => {
          const opts = availableFor(u.yahoo.yahooTeamKey);
          const currentPick = picks[u.yahoo.yahooTeamKey];
          const isGhostJustCreated =
            currentPick && extraTeams.some((t) => t.id === currentPick);
          return (
            <div
              key={u.yahoo.yahooTeamKey}
              className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 md:gap-3 items-center"
            >
              <div className="text-sm">
                <div className="text-neutral-200">{u.yahoo.yahooTeamName}</div>
                <div className="text-xs text-neutral-500">
                  manager: {u.yahoo.manager ?? '(none)'} ·{' '}
                  <span className="font-mono">{u.yahoo.yahooTeamKey}</span>
                </div>
              </div>
              <select
                value={currentPick ?? ''}
                onChange={(e) =>
                  setPicks((prev) => ({
                    ...prev,
                    [u.yahoo.yahooTeamKey]: e.target.value,
                  }))
                }
                className="w-full md:w-56 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="">— choose franchise —</option>
                {opts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.owner_name}
                    {extraTeams.some((e) => e.id === t.id) ? ' (ghost)' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => createGhost(u)}
                disabled={creatingGhostFor != null || !!currentPick}
                title={
                  currentPick
                    ? 'Already mapped — clear the dropdown to create a ghost'
                    : `Create a ghost franchise for ${u.yahoo.manager ?? u.yahoo.yahooTeamName}`
                }
                className="px-2 py-1.5 text-xs font-medium rounded bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {creatingGhostFor === u.yahoo.yahooTeamKey
                  ? '…'
                  : isGhostJustCreated
                    ? '✓ ghost'
                    : '+ Ghost'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 text-sm font-semibold rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save mappings'}
        </button>
      </div>
    </div>
  );
}

function SeasonRow({
  status,
  allTeams,
}: {
  status: SeasonStatus;
  allTeams: Team[];
}) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionId | null>(null);
  const [unresolved, setUnresolved] = useState<UnresolvedYahoo[] | null>(null);
  const [autoTakenIds, setAutoTakenIds] = useState<string[]>([]);
  const router = useRouter();

  const expected = status.num_teams ?? 12;
  const teamsOk = status.teams_mapped >= expected;
  const standingsOk = status.standings_count >= expected;
  const matchupsOk = status.matchups_count > 0;
  const rostersOk = status.roster_count > 0;

  async function runAction(action: ActionId) {
    setPendingAction(action);
    try {
      const res = await fetch(ACTION_ENDPOINTS[action](status.season));
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Request failed', ok: false });
      } else {
        const parts: string[] = [];
        if (typeof data.already_mapped === 'number' && data.already_mapped > 0)
          parts.push(`${data.already_mapped} already mapped`);
        if (typeof data.auto_matched === 'number')
          parts.push(`${data.auto_matched} newly auto-matched`);
        if (data.unresolved?.length > 0)
          parts.push(`${data.unresolved.length} unresolved`);
        if (typeof data.standings_synced === 'number')
          parts.push(`${data.standings_synced} standings`);
        if (typeof data.matchups_upserted === 'number')
          parts.push(`${data.matchups_upserted} matchups`);
        if (typeof data.players_written === 'number')
          parts.push(`${data.players_written} players`);
        if (data.champion_team_id) parts.push('champion saved');
        setMessage({ text: parts.length > 0 ? parts.join(' · ') : 'Done.', ok: true });

        if (action === 'teams') {
          if (Array.isArray(data.unresolved) && data.unresolved.length > 0) {
            setUnresolved(data.unresolved as UnresolvedYahoo[]);
            setAutoTakenIds(
              Array.isArray(data.matched_team_ids) ? (data.matched_team_ids as string[]) : [],
            );
          } else {
            setUnresolved(null);
          }
        }
        router.refresh();
      }
    } catch {
      setMessage({ text: 'Network error', ok: false });
    } finally {
      setPendingAction(null);
    }
  }

  // Combined taken list: server-side existing + this-session auto matches.
  const takenIds = Array.from(new Set([...status.taken_team_ids, ...autoTakenIds]));

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          <span className="num text-lg font-semibold text-neutral-100">{status.season}</span>
          {status.is_active && (
            <span className="text-xs text-cyan-400 uppercase tracking-wider">Active</span>
          )}
          {status.league_name && (
            <span className="text-sm text-neutral-500">{status.league_name}</span>
          )}
        </div>
        <div className="text-xs text-neutral-600 font-mono">
          {status.league_key ?? '— no league discovered —'}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Teams</div>
          <StatusDot ok={teamsOk} count={status.teams_mapped} />
        </div>
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Standings</div>
          <StatusDot ok={standingsOk} count={status.standings_count} />
        </div>
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Matchups</div>
          <StatusDot ok={matchupsOk} count={status.matchups_count} />
        </div>
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Champion</div>
          <StatusDot ok={status.has_champion} />
        </div>
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Rosters</div>
          <StatusDot ok={rostersOk} count={status.roster_count} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['teams', 'standings', 'matchups', 'champions', 'rosters'] as ActionId[]).map((a) => {
          const isDisabled =
            (a === 'teams' && !status.league_key) ||
            (a === 'standings' && !teamsOk) ||
            (a === 'matchups' && !teamsOk) ||
            (a === 'champions' && !matchupsOk) ||
            (a === 'rosters' && !teamsOk);
          return (
            <button
              key={a}
              onClick={() => runAction(a)}
              disabled={pendingAction != null || isDisabled}
              className="px-3 py-1.5 text-xs font-medium rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pendingAction === a ? '…' : ACTION_LABELS[a]}
            </button>
          );
        })}
      </div>

      {message && (
        <p
          className={`mt-3 text-xs px-3 py-2 rounded ${
            message.ok
              ? 'bg-green-900/30 text-green-300 border border-green-800/50'
              : 'bg-red-900/30 text-red-300 border border-red-800/50'
          }`}
        >
          {message.text}
        </p>
      )}

      {unresolved && unresolved.length > 0 && (
        <ResolveConflicts
          season={status.season}
          unresolved={unresolved}
          takenTeamIds={takenIds}
          allTeams={allTeams}
          onDone={(t, ok) => {
            setMessage({ text: t, ok });
            if (ok) setUnresolved(null);
          }}
        />
      )}
    </div>
  );
}

function DiscoverAll() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const router = useRouter();

  async function run() {
    setPending(true);
    try {
      const res = await fetch('/api/yahoo/discover-leagues');
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Request failed', ok: false });
      } else {
        setMessage({
          text: `Found ${data.count} leagues across ${data.seasons_requested.length} seasons`,
          ok: true,
        });
        router.refresh();
      }
    } catch {
      setMessage({ text: 'Network error', ok: false });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-neutral-200 mb-1">Discover Leagues</h2>
          <p className="text-xs text-neutral-500">
            Asks Yahoo which leagues your account belonged to for every season the app knows
            about (2018-present). Run this once before mapping teams.
          </p>
        </div>
        <button
          onClick={run}
          disabled={pending}
          className="shrink-0 px-4 py-2 text-sm font-semibold rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
        >
          {pending ? 'Discovering…' : 'Discover All'}
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 text-xs px-3 py-2 rounded ${
            message.ok
              ? 'bg-green-900/30 text-green-300 border border-green-800/50'
              : 'bg-red-900/30 text-red-300 border border-red-800/50'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

export default function HistoryPanel({
  statuses,
  allTeams,
}: {
  statuses: SeasonStatus[];
  allTeams: Team[];
}) {
  return (
    <div className="space-y-4">
      <DiscoverAll />
      {statuses
        .slice()
        .sort((a, b) => b.season - a.season)
        .map((s) => (
          <SeasonRow key={s.season} status={s} allTeams={allTeams} />
        ))}
    </div>
  );
}
