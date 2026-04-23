'use client';

import { useState, useMemo } from 'react';

export interface TransactionRow {
  id: string;
  transaction_type: 'add' | 'drop' | 'trade' | 'commish';
  week: number | null;
  season: number;
  faab_spent: number | null;
  created_at: string;
  player: { name: string; position: string | null } | null;
  team: { name: string | null; owner_name: string } | null;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const BADGE_CLASS: Record<TransactionRow['transaction_type'], string> = {
  add: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  drop: 'bg-red-500/20 text-red-400 border border-red-500/30',
  trade: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  commish: 'bg-neutral-700/40 text-neutral-400 border border-neutral-600/30',
};

export default function TransactionsFeed({
  transactions,
}: {
  transactions: TransactionRow[];
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((tx) => tx.player?.name?.toLowerCase().includes(q));
  }, [transactions, query]);

  const byWeek = useMemo(() => {
    const map = new Map<number | null, TransactionRow[]>();
    for (const tx of filtered) {
      const w = tx.week ?? null;
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(tx);
    }
    return map;
  }, [filtered]);

  const sortedWeeks = [...byWeek.keys()].sort((a, b) => (b ?? 0) - (a ?? 0));
  const trimmedQuery = query.trim();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-accent">The Raven</h1>
        <p className="text-neutral-500 mt-1 text-sm">
          2025 Season · waiver wire &amp; trade activity
        </p>
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pl-9 pr-8 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
          >
            ×
          </button>
        )}
      </div>

      {/* Result count */}
      {trimmedQuery && (
        <p className="mb-4 text-sm text-neutral-500">
          Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &lsquo;{trimmedQuery}&rsquo;
        </p>
      )}

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-12 text-center">
          <p className="text-sm italic text-neutral-500">
            {trimmedQuery
              ? `No transactions found for ‘${trimmedQuery}’.`
              : 'The ravens carry no news. No transactions have been synced yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedWeeks.map((week) => {
            const weekTxs = byWeek.get(week)!;
            return (
              <section key={week ?? 'unknown'}>
                <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  {week != null ? `Week ${week}` : 'Unknown Week'}
                </h2>
                <div className="divide-y divide-neutral-800/70 rounded-lg border border-neutral-800 bg-neutral-900">
                  {weekTxs.map((tx) => {
                    const playerName = tx.player?.name ?? '—';
                    const position = tx.player?.position ?? null;
                    const teamLabel = tx.team?.name ?? tx.team?.owner_name ?? '—';
                    const badgeClass = BADGE_CLASS[tx.transaction_type];

                    return (
                      <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`shrink-0 rounded text-xs font-semibold px-2 py-0.5 ${badgeClass}`}
                        >
                          {tx.transaction_type.toUpperCase()}
                        </span>

                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-neutral-100">{playerName}</span>
                          {position && (
                            <span className="ml-2 text-xs text-neutral-500">{position}</span>
                          )}
                          <span className="text-sm text-neutral-500"> · {teamLabel}</span>
                          {tx.faab_spent != null && tx.faab_spent > 0 && (
                            <span className="ml-2 num text-xs text-yellow-400">
                              ${tx.faab_spent} FAAB
                            </span>
                          )}
                        </div>

                        <span className="shrink-0 num whitespace-nowrap text-xs text-neutral-600">
                          {relativeTime(tx.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
