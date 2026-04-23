import { createAnonServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'The Raven · League of Thrones',
};

interface TransactionRow {
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

export default async function TransactionsPage() {
  const supabase = createAnonServerClient();

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id, transaction_type, week, season, faab_spent, created_at,
      player:players!left(name, position),
      team:teams!left(name, owner_name)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const transactions = (data ?? []) as unknown as TransactionRow[];

  // Group by week, most recent first
  const byWeek = new Map<number | null, TransactionRow[]>();
  for (const tx of transactions) {
    const w = tx.week ?? null;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(tx);
  }
  const sortedWeeks = [...byWeek.keys()].sort((a, b) => (b ?? 0) - (a ?? 0));

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-accent">The Raven</h1>
        <p className="text-neutral-500 mt-1 text-sm">
          2025 Season · waiver wire &amp; trade activity
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-6 py-12 text-center">
          <p className="text-neutral-500 italic text-sm">
            The ravens carry no news. No transactions have been synced yet.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedWeeks.map((week) => {
            const weekTxs = byWeek.get(week)!;
            return (
              <section key={week ?? 'unknown'}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3 px-1">
                  {week != null ? `Week ${week}` : 'Unknown Week'}
                </h2>
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg divide-y divide-neutral-800/70">
                  {weekTxs.map((tx) => {
                    const playerName = tx.player?.name ?? '—';
                    const position = tx.player?.position ?? null;
                    const teamLabel =
                      tx.team?.name ?? tx.team?.owner_name ?? '—';
                    const badgeClass = BADGE_CLASS[tx.transaction_type];

                    return (
                      <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${badgeClass}`}
                        >
                          {tx.transaction_type.toUpperCase()}
                        </span>

                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-neutral-100">
                            {playerName}
                          </span>
                          {position && (
                            <span className="ml-2 text-xs text-neutral-500">
                              {position}
                            </span>
                          )}
                          <span className="text-neutral-500 text-sm">
                            {' '}· {teamLabel}
                          </span>
                          {tx.faab_spent != null && tx.faab_spent > 0 && (
                            <span className="ml-2 num text-xs text-yellow-400">
                              ${tx.faab_spent} FAAB
                            </span>
                          )}
                        </div>

                        <span className="shrink-0 num text-xs text-neutral-600 whitespace-nowrap">
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
