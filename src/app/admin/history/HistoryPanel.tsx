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

function ActionButton({
  season,
  action,
  disabled,
  onResult,
}: {
  season: number;
  action: ActionId;
  disabled?: boolean;
  onResult: (msg: string, ok: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function run() {
    setPending(true);
    try {
      const res = await fetch(ACTION_ENDPOINTS[action](season));
      const data = await res.json();
      if (!res.ok) {
        onResult(data.error ?? 'Request failed', false);
      } else {
        const parts: string[] = [];
        if (typeof data.auto_matched === 'number')
          parts.push(`${data.auto_matched}/${data.yahoo_teams} matched`);
        if (data.unresolved?.length > 0)
          parts.push(`${data.unresolved.length} unresolved`);
        if (typeof data.standings_synced === 'number')
          parts.push(`${data.standings_synced} standings`);
        if (typeof data.matchups_upserted === 'number')
          parts.push(`${data.matchups_upserted} matchups`);
        if (typeof data.players_written === 'number')
          parts.push(`${data.players_written} players`);
        if (data.champion_team_id) parts.push('champion saved');
        onResult(parts.length > 0 ? parts.join(' · ') : 'Done.', true);
        router.refresh();
      }
    } catch {
      onResult('Network error', false);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={pending || disabled}
      className="px-3 py-1.5 text-xs font-medium rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {pending ? '…' : ACTION_LABELS[action]}
    </button>
  );
}

function SeasonRow({ status }: { status: SeasonStatus }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const expected = status.num_teams ?? 12;
  const teamsOk = status.teams_mapped >= expected;
  const standingsOk = status.standings_count >= expected;
  const matchupsOk = status.matchups_count > 0;
  const rostersOk = status.roster_count > 0;

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
        <ActionButton
          season={status.season}
          action="teams"
          disabled={!status.league_key}
          onResult={(t, ok) => setMessage({ text: t, ok })}
        />
        <ActionButton
          season={status.season}
          action="standings"
          disabled={!teamsOk}
          onResult={(t, ok) => setMessage({ text: t, ok })}
        />
        <ActionButton
          season={status.season}
          action="matchups"
          disabled={!teamsOk}
          onResult={(t, ok) => setMessage({ text: t, ok })}
        />
        <ActionButton
          season={status.season}
          action="champions"
          disabled={!matchupsOk}
          onResult={(t, ok) => setMessage({ text: t, ok })}
        />
        <ActionButton
          season={status.season}
          action="rosters"
          disabled={!teamsOk}
          onResult={(t, ok) => setMessage({ text: t, ok })}
        />
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

export default function HistoryPanel({ statuses }: { statuses: SeasonStatus[] }) {
  return (
    <div className="space-y-4">
      <DiscoverAll />
      {statuses
        .slice()
        .sort((a, b) => b.season - a.season)
        .map((s) => (
          <SeasonRow key={s.season} status={s} />
        ))}
    </div>
  );
}
