'use client';

import { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export type FeatureFlag = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
};

type ActionDef = {
  id: string;
  label: string;
  description: string;
  warning?: string;
  confirmText: string;
  endpoint: string;
  method: 'GET' | 'POST';
  destructive?: boolean;
};

// ── Action definitions ─────────────────────────────────────────────────────

const ACTIONS: ActionDef[] = [
  {
    id: 'rollover',
    label: 'Advance to Next Season',
    description:
      'Use this once per year, in April, after you\'ve confirmed all contracts from the previous season are correct. This single button does three things: advances every active player\'s contract year by 1 (Year 1 becomes Year 2, etc.), recalculates every player\'s salary for the new season using the keeper formula (current cost + 2, then × 1.05), and automatically expires any player who has reached Year 5 — they return to the auction pool.',
    warning:
      'This cannot be undone. Make sure every contract is accurate before running. Check the Contracts page first and verify owner names, salaries, and contract years for all 12 teams.',
    confirmText: 'advance all contracts to next season and expire any Year 4 players',
    endpoint: '/api/admin/controls/rollover-season',
    method: 'POST',
    destructive: true,
  },
  {
    id: 'sync-transactions',
    label: 'Sync Transactions Now',
    description:
      'Manually pulls the latest adds, drops, and trades from Yahoo right now, instead of waiting for the nightly sync. Use this on draft day, during peak waiver periods, or any time you want The Raven to reflect something that just happened in Yahoo.',
    confirmText: 'pull the latest transactions from Yahoo',
    endpoint: '/api/yahoo/sync-transactions',
    method: 'GET',
  },
  {
    id: 'sync-rosters',
    label: 'Sync Rosters Now',
    description:
      'Manually refreshes the player pool from Yahoo. Use this after the auction draft concludes to pull everyone\'s new roster into the system. Also useful mid-season if you notice a player on a roster in Yahoo who isn\'t showing up on the site.',
    confirmText: 'pull the latest rosters from Yahoo',
    endpoint: '/api/yahoo/sync-rosters',
    method: 'GET',
  },
  {
    id: 'sync-standings',
    label: 'Sync Standings Now',
    description:
      'Pulls the latest wins, losses, points for, and points against from Yahoo. Use this weekly during the season to keep the standings page up to date, or after the regular season ends to lock in final playoff seeds.',
    confirmText: 'pull the latest standings from Yahoo',
    endpoint: '/api/yahoo/sync-standings',
    method: 'GET',
  },
];

// ── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({
  flagKey,
  initialEnabled,
  label,
}: {
  flagKey: string;
  initialEnabled: boolean;
  label: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    const next = !enabled;
    try {
      const res = await fetch('/api/admin/controls/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flagKey, enabled: next }),
      });
      if (res.ok) setEnabled(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={`Toggle ${label}`}
      aria-checked={enabled}
      role="switch"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-50 ${
        enabled ? 'bg-cyan-500' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ── Confirmation modal ─────────────────────────────────────────────────────

function ConfirmModal({
  action,
  onClose,
  onConfirm,
}: {
  action: ActionDef;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-neutral-100 mb-2">{action.label}</h3>
        <p className="text-sm text-neutral-400 mb-4">
          This will <span className="text-neutral-200">{action.confirmText}</span>. Continue?
        </p>
        {action.warning && (
          <p className="text-xs text-yellow-400 mb-5 bg-yellow-400/5 border border-yellow-400/20 rounded px-3 py-2">
            ⚠️ {action.warning}
          </p>
        )}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded transition-colors ${
              action.destructive
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-cyan-500 hover:bg-cyan-400 text-neutral-950'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Action card ────────────────────────────────────────────────────────────

function ActionCard({ action }: { action: ActionDef }) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setConfirming(false);
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(action.endpoint, { method: action.method });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error ?? 'Request failed' });
      } else {
        const parts: string[] = [];
        if (typeof data.transactions_synced === 'number')
          parts.push(`${data.transactions_synced} transactions synced`);
        if (typeof data.advanced === 'number') parts.push(`${data.advanced} contracts advanced`);
        if (typeof data.expired === 'number') parts.push(`${data.expired} contracts expired`);
        if (typeof data.records_processed === 'number')
          parts.push(`${data.records_processed} records processed`);
        setResult({ ok: true, message: parts.length > 0 ? parts.join(', ') : 'Done.' });
      }
    } catch {
      setResult({ ok: false, message: 'Network error' });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {confirming && (
        <ConfirmModal
          action={action}
          onClose={() => setConfirming(false)}
          onConfirm={run}
        />
      )}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-neutral-100">{action.label}</h3>
        <p className="text-sm text-neutral-400 leading-relaxed">{action.description}</p>
        {action.warning && (
          <p className="text-xs text-yellow-400">⚠️ {action.warning}</p>
        )}
        {result && (
          <p
            className={`text-xs px-3 py-2 rounded ${
              result.ok
                ? 'bg-green-900/40 text-green-300 border border-green-800'
                : 'bg-red-900/40 text-red-300 border border-red-800'
            }`}
          >
            {result.message}
          </p>
        )}
        <button
          onClick={() => setConfirming(true)}
          disabled={pending}
          className={`px-4 py-2 text-sm font-semibold rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            action.destructive
              ? 'bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30'
              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20'
          }`}
        >
          {pending ? 'Running…' : action.label}
        </button>
      </div>
    </>
  );
}

// ── Feature flag card ──────────────────────────────────────────────────────

function FlagCard({ flag }: { flag: FeatureFlag }) {
  const [enabled, setEnabled] = useState(flag.enabled);

  // Keep local state in sync so the dot reflects optimistic updates from Toggle
  // Toggle manages its own state; we just pass initialEnabled
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                enabled ? 'bg-green-400' : 'bg-neutral-600'
              }`}
            />
            <h3 className="font-semibold text-neutral-100">{flag.label}</h3>
          </div>
          {flag.description && (
            <p className="text-sm text-neutral-400 leading-relaxed whitespace-pre-line mt-2">
              {flag.description}
            </p>
          )}
        </div>
        <div className="shrink-0 pt-0.5">
          <Toggle
            flagKey={flag.key}
            initialEnabled={flag.enabled}
            label={flag.label}
          />
        </div>
      </div>
      <p className={`text-xs mt-3 font-medium ${enabled ? 'text-green-400' : 'text-neutral-600'}`}>
        {enabled ? 'ON' : 'OFF'}
      </p>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function ControlsPanel({ flags }: { flags: FeatureFlag[] }) {
  return (
    <div className="space-y-12">

      {/* Section A: Feature Toggles */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-100 mb-1">Feature Toggles</h2>
        <p className="text-sm text-neutral-500 mb-5">
          Turn site features on or off. Changes take effect immediately.
        </p>
        <div className="space-y-4">
          {flags.map((flag) => (
            <FlagCard key={flag.key} flag={flag} />
          ))}
          {flags.length === 0 && (
            <p className="text-sm italic text-neutral-600">
              No feature flags found — run the migration to seed them.
            </p>
          )}
        </div>
      </section>

      {/* Section B: One-Time Actions */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-100 mb-1">One-Time Actions</h2>
        <p className="text-sm text-neutral-500 mb-5">
          Manual operations for commissioner use. Each shows a confirmation before running.
        </p>
        <div className="space-y-4">
          {ACTIONS.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      </section>

    </div>
  );
}
