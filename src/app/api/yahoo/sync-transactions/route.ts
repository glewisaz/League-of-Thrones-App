import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllTransactions } from '@/lib/yahoo/transactions';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: auth, error: authError } = await supabase
      .from('yahoo_auth')
      .select('league_key')
      .eq('id', 1)
      .maybeSingle();
    if (authError) throw authError;
    if (!auth?.league_key) {
      return NextResponse.json(
        { error: 'league_key not set — run Yahoo OAuth connect first' },
        { status: 400 },
      );
    }

    // Build yahoo_team_key → team UUID map for resolving team_id
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, yahoo_team_key');
    if (teamsError) throw teamsError;

    const teamKeyMap = new Map<string, string>();
    for (const t of teams ?? []) {
      const row = t as { id: string; yahoo_team_key: string | null };
      if (row.yahoo_team_key) teamKeyMap.set(row.yahoo_team_key, row.id);
    }

    const transactions = await fetchAllTransactions(auth.league_key);
    if (transactions.length === 0) {
      return NextResponse.json({ ok: true, transactions_synced: 0 });
    }

    // Only set player_id FK if the player actually exists in the players table
    const uniquePlayerIds = [
      ...new Set(transactions.map((t) => t.player_id).filter(Boolean) as string[]),
    ];
    const existingPlayerIds = new Set<string>();
    if (uniquePlayerIds.length > 0) {
      const { data: existing } = await supabase
        .from('players')
        .select('yahoo_player_id')
        .in('yahoo_player_id', uniquePlayerIds);
      for (const p of existing ?? []) {
        existingPlayerIds.add((p as { yahoo_player_id: string }).yahoo_player_id);
      }
    }

    let synced = 0;
    const errors: string[] = [];

    for (const tx of transactions) {
      const teamId = tx.team_key ? (teamKeyMap.get(tx.team_key) ?? null) : null;
      const playerId =
        tx.player_id && existingPlayerIds.has(tx.player_id) ? tx.player_id : null;

      const { error } = await supabase.from('transactions').upsert(
        {
          yahoo_transaction_id: tx.yahoo_transaction_id,
          season: tx.season,
          week: tx.week,
          team_id: teamId,
          transaction_type: tx.transaction_type,
          player_id: playerId,
          faab_spent: tx.faab_spent,
          raw_payload: tx.raw_payload,
          created_at: tx.created_at,
        },
        { onConflict: 'yahoo_transaction_id' },
      );

      if (error) {
        errors.push(`${tx.yahoo_transaction_id}: ${error.message}`);
      } else {
        synced++;
      }
    }

    return NextResponse.json({
      ok: true,
      transactions_synced: synced,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('[sync-transactions]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
