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

    // yahoo_team_key is populated by sync-teams. If that hasn't run yet, all
    // team_id lookups below will return null and transactions will be saved
    // without a team association. Re-syncing after sync-teams fixes them.
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, owner_name, yahoo_team_key');
    if (teamsError) throw teamsError;

    console.log('Teams with yahoo_team_key:', JSON.stringify(teams));

    const teamKeyMap = new Map<string, string>();
    for (const t of teams ?? []) {
      const row = t as { id: string; owner_name: string; yahoo_team_key: string | null };
      if (row.yahoo_team_key) teamKeyMap.set(row.yahoo_team_key, row.id);
    }

    const transactions = await fetchAllTransactions(auth.league_key);
    console.log('Raw transactions fetched:', transactions.length);
    console.log('First transaction sample:', JSON.stringify(transactions[0], null, 2));

    // Log unique team keys from transactions so we can compare to what's stored
    const uniqueTeamKeys = [...new Set(transactions.map((t) => t.team_key).filter(Boolean))];
    console.log('Unique team_keys in transactions:', JSON.stringify(uniqueTeamKeys));
    if (transactions.length === 0) {
      return NextResponse.json({ ok: true, transactions_synced: 0 });
    }

    // Player resolution — three steps to avoid FK violations on transaction insert:
    //
    // 1. Dedupe: collect one name/position per yahoo_player_id across all transactions.
    //    We use the first occurrence; subsequent transactions for the same player are ignored.
    const playerMeta = new Map<string, { name: string; position: string | null }>();
    for (const tx of transactions) {
      if (tx.player_id && tx.player_name && !playerMeta.has(tx.player_id)) {
        playerMeta.set(tx.player_id, { name: tx.player_name, position: tx.player_position });
      }
    }

    // 2. Check existence: single batch query to find which player_ids are already in DB.
    const uniquePlayerIds = [...playerMeta.keys()];
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

    // 3. Batch upsert stubs for unknown players so transaction rows can reference them.
    //    These stubs have nfl_team=null and may have incomplete position data — sync-rosters
    //    will fill in the full details the next time it runs.
    const missingPlayers = uniquePlayerIds
      .filter((id) => !existingPlayerIds.has(id))
      .map((id) => ({
        yahoo_player_id: id,
        name: playerMeta.get(id)!.name,
        position: playerMeta.get(id)!.position,
        nfl_team: null,
      }));

    if (missingPlayers.length > 0) {
      const { error: playerUpsertError } = await supabase
        .from('players')
        .upsert(missingPlayers, { onConflict: 'yahoo_player_id' });
      if (playerUpsertError) {
        console.error('[sync-transactions] player upsert error:', playerUpsertError.message);
      } else {
        for (const p of missingPlayers) existingPlayerIds.add(p.yahoo_player_id);
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
      players_created: missingPlayers.length,
      team_keys_in_db: [...teamKeyMap.keys()],
      team_keys_in_transactions: uniqueTeamKeys,
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
