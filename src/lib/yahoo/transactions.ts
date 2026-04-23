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

function extractWeek(transactionKey: string): number | null {
  const match = transactionKey.match(/\.w\.(\d+)\./);
  return match ? parseInt(match[1], 10) : null;
}

function parseTransactionData(
  tdRaw: unknown,
  txType: string,
): { resolvedType: 'add' | 'drop' | 'trade' | 'commish'; teamKey: string | null; faab: number | null } {
  if (txType === 'trade') {
    const td = Array.isArray(tdRaw) ? tdRaw[0] : tdRaw;
    const rec = (td && typeof td === 'object' ? td : {}) as Record<string, unknown>;
    const teamKey = (rec.destination_team_key as string | undefined) ?? null;
    return { resolvedType: 'trade', teamKey, faab: null };
  }

  const td = Array.isArray(tdRaw) ? tdRaw[0] : tdRaw;
  const rec = (td && typeof td === 'object' ? td : {}) as Record<string, unknown>;
  const tdType = (rec.type as string) ?? '';

  const resolvedType: 'add' | 'drop' | 'commish' =
    tdType === 'add' ? 'add' : tdType === 'drop' ? 'drop' : 'commish';

  // For adds: team acquiring the player is destination. For drops: source.
  const teamKey =
    tdType === 'add'
      ? ((rec.destination_team_key as string | undefined) ?? null)
      : ((rec.source_team_key as string | undefined) ?? null);

  const faabRaw = rec.faab_bid_amount;
  const faabParsed = faabRaw != null ? parseInt(faabRaw as string, 10) : NaN;
  const faab = isNaN(faabParsed) ? null : faabParsed;

  return { resolvedType, teamKey, faab };
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
      if (!Array.isArray(txArr) || !txArr[0]) continue;

      const txMeta = txArr[0] as Record<string, unknown>;
      const txKey = txMeta.transaction_key as string | undefined;
      if (!txKey) continue;

      const txType = (txMeta.type as string) ?? '';
      const timestamp = txMeta.timestamp as string | undefined;
      const createdAt = timestamp
        ? new Date(parseInt(timestamp, 10) * 1000).toISOString()
        : new Date().toISOString();
      const week = extractWeek(txKey);

      const playersObj = txMeta.players as Record<string, unknown> | undefined;
      if (!playersObj) continue;

      const players = iterateYahooObject(playersObj);

      players.forEach((playerItem, idx) => {
        if (!playerItem || typeof playerItem !== 'object') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playerArr = (playerItem as any).player as unknown[] | undefined;
        if (!Array.isArray(playerArr)) return;

        // playerArr[0] is the flat player info array; playerArr[1] has transaction_data
        const playerInfoArr = playerArr[0] as unknown[];
        const playerKey = Array.isArray(playerInfoArr)
          ? (findInArray(playerInfoArr, 'player_key') as string | undefined)
          : undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tdWrapper = playerArr[1] as any;
        const { resolvedType, teamKey, faab } = parseTransactionData(
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

    if (txItems.length < BATCH_SIZE) break;
    start += BATCH_SIZE;
  }

  return all;
}
