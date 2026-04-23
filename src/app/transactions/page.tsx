import { createAnonServerClient } from '@/lib/supabase/server';
import { getActiveSeason } from '@/lib/queries/seasons';
import TransactionsFeed, { type TransactionRow } from './TransactionsFeed';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'The Raven · League of Thrones',
};

export default async function TransactionsPage() {
  const supabase = createAnonServerClient();

  const [{ data, error }, season] = await Promise.all([
    supabase
      .from('transactions')
      .select(`
        id, transaction_type, week, season, faab_spent, created_at,
        player:players!left(name, position),
        team:teams!left(name, owner_name)
      `)
      .order('created_at', { ascending: false }),
    getActiveSeason(),
  ]);

  if (error) throw error;

  const seasonYear = season?.year ?? new Date().getFullYear();

  return (
    <TransactionsFeed
      transactions={(data ?? []) as unknown as TransactionRow[]}
      seasonYear={seasonYear}
    />
  );
}
