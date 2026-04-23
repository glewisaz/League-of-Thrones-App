import { yahooFetch } from '@/lib/yahoo/client';
import { iterateYahooObject, findInArray } from '@/lib/yahoo/parse';

const SEASON = 2025;
const BATCH_SIZE = 25;

export interface ParsedTransaction {
  yahoo_transaction_id: string;
  transaction_type: 'add' | 'drop' | 'trade' | 'commish';
  player_id: string | null;
  team_key: string | null;
  faab_spent: number | null;
  week: number | null;
  season: number;
  created_at: string;
  raw_payload: unknown;
}

// transaction_data shape determines type:
//   array  → add  (destination_team_key)
//   object → drop (source_team_key)
//   trade always uses destination_team_key regardless of shape
function parseTransactionData(
  tdRaw: unknown,
  txType: string,
): { resolvedType: 'add' | 'drop' | 'trade' | 'commish'; teamKey: string | null } {
  if (txType === 'trade') {
    const td = Array.isArray(tdRaw) ? tdRaw[0] : tdRaw;
    const rec = (td && typeof td === 'object' ? td : {}) as Record<string, unknown>;
    return {
      resolvedType: 'trade',
      teamKey: (rec.destination_team_key as string | undefined) ?? null,
    };
  }

  if (Array.isArray(tdRaw)) {
    // add: transaction_data is an array
    const td = (tdRaw[0] ?? {}) as Record<string, unknown>;
    return {
      resolvedType: 'add',
      teamKey: (td.destination_team_key as string | undefined) ?? null,
    };
  }

  if (tdRaw && typeof tdRaw === 'object') {
    // drop: transaction_data is an object
    const td = tdRaw as Record<string, unknown>;
    return {
      resolvedType: 'drop',
      teamKey: (td.source_team_key as string | undefined) ?? null,
    };
  }

  return { resolvedType: 'commish', teamKey: null };
}

export async function fetchAllTransactions(leagueKey: string): Promise<ParsedTransaction[]> {
  const all: ParsedTransaction[] = [];
  let start = 0;

  while (true) {
    const endpoint =
      `/league/${leagueKey}/transactions;types=add,drop,trade;count=${BATCH_SIZE};start=${start}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (await yahooFetch(endpoint)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueArr = response?.fantasy_content?.league as any[] | undefined;
    if (!Array.isArray(leagueArr) || leagueArr.length < 2) break;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txObj = (leagueArr[1] as any)?.transactions as Record<string, unknown> | undefined;
    if (!txObj) break;

    const txItems = iterateYahooObject(txObj);
    if (txItems.length === 0) break;

    for (const item of txItems) {
      if (!item || typeof item !== 'object') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txArr = (item as any).transaction as unknown[] | undefined;
      if (!Array.isArray(txArr) || txArr.length < 2) continue;

      // transaction[0] — metadata: key, type, timestamp, faab_bid
      // transaction[1] — body: { players: { "0": ..., "1": ..., count: N } }
      const txMeta = txArr[0] as Record<string, unknown>;
      const txBody = txArr[1] as Record<string, unknown>;

      const txKey = txMeta.transaction_key as string | undefined;
      if (!txKey) continue;

      const txType = (txMeta.type as string) ?? '';
      const timestamp = txMeta.timestamp as string | undefined;
      const createdAt = timestamp
        ? new Date(parseInt(timestamp, 10) * 1000).toISOString()
        : new Date().toISOString();

      // FAAB is at the top level of the transaction metadata, not inside transaction_data
      const faabRaw = txMeta.faab_bid;
      const faabParsed = faabRaw != null ? parseInt(faabRaw as string, 10) : NaN;
      const faab = isNaN(faabParsed) ? null : faabParsed;

      // Key format is "461.l.708208.tr.474" — no week number embedded
      const week: number | null = null;

      const playersObj = txBody?.players as Record<string, unknown> | undefined;
      if (!playersObj) continue;

      const players = iterateYahooObject(playersObj);

      players.forEach((playerItem, idx) => {
        if (!playerItem || typeof playerItem !== 'object') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playerArr = (playerItem as any).player as unknown[] | undefined;
        if (!Array.isArray(playerArr)) return;

        // player[0] — flat info array; player[1] — { transaction_data: array | object }
        const playerInfoArr = playerArr[0] as unknown[];
        const playerKey = Array.isArray(playerInfoArr)
          ? (findInArray(playerInfoArr, 'player_key') as string | undefined)
          : undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tdWrapper = playerArr[1] as any;
        const { resolvedType, teamKey } = parseTransactionData(
          tdWrapper?.transaction_data,
          txType,
        );

        all.push({
          yahoo_transaction_id: `${txKey}_p${idx}`,
          transaction_type: resolvedType,
          player_id: playerKey ?? null,
          team_key: teamKey,
          faab_spent: faab,
          week,
          season: SEASON,
          created_at: createdAt,
          raw_payload: item,
        });
      });
    }

    // Stop when Yahoo returns a partial page — we've exhausted all results
    if (txItems.length < BATCH_SIZE) break;
    start += BATCH_SIZE;
  }

  return all;
}
