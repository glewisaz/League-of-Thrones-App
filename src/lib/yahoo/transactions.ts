import { yahooFetch } from '@/lib/yahoo/client';
import { iterateYahooObject, findInArray } from '@/lib/yahoo/parse';

const SEASON = 2025;
const BATCH_SIZE = 25;

export interface ParsedTransaction {
  yahoo_transaction_id: string;
  transaction_type: 'add' | 'drop' | 'trade' | 'commish';
  player_id: string | null;
  player_name: string | null;
  player_position: string | null;
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
): { resolvedType: 'add' | 'drop' | 'trade' | 'commish'; teamKey: string | null; faabSpent: number | null } {
  if (txType === 'trade') {
    const td = (Array.isArray(tdRaw) ? tdRaw[0] : tdRaw) as Record<string, unknown> | undefined;
    return {
      resolvedType: 'trade',
      teamKey: (td?.destination_team_key as string | undefined) ?? null,
      faabSpent: null,
    };
  }

  if (Array.isArray(tdRaw)) {
    // add: transaction_data is an array; team is the destination
    const data = (tdRaw[0] ?? {}) as Record<string, unknown>;
    const faabRaw = data.faab_bid_amount;
    const faab = faabRaw != null ? Number(faabRaw) : null;
    return {
      resolvedType: 'add',
      teamKey: (data.destination_team_key as string | undefined) ?? null,
      faabSpent: faab != null && !isNaN(faab) ? faab : null,
    };
  }

  if (tdRaw && typeof tdRaw === 'object') {
    // drop: transaction_data is an object; team is the source
    const data = tdRaw as Record<string, unknown>;
    return {
      resolvedType: 'drop',
      teamKey: (data.source_team_key as string | undefined) ?? null,
      faabSpent: null,
    };
  }

  return { resolvedType: 'commish', teamKey: null, faabSpent: null };
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

        // playerArr[0] is the outer wrapper array of single-key info objects.
        // playerArr[0][0] == { player_key }, playerArr[0][1] == { name }, etc.
        // playerArr[1] holds { transaction_data }.
        const playerInfoArr = playerArr[0] as unknown[];
        const flatInfo = Array.isArray(playerInfoArr) ? playerInfoArr : [];

        const playerKey = findInArray(flatInfo, 'player_key') as string | undefined;
        const nameRaw = findInArray(flatInfo, 'name');
        const playerName =
          typeof nameRaw === 'string'
            ? nameRaw
            : (nameRaw as { full?: string } | undefined)?.full ?? null;
        const displayPosition = findInArray(flatInfo, 'display_position') as string | undefined;

        if (!playerKey) {
          console.warn(
            `[transactions] no player_key for ${txKey}_p${idx}` +
              ` type=${txType} position=${displayPosition ?? '?'} name=${playerName ?? '?'}`,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tdWrapper = playerArr[1] as any;
        const { resolvedType, teamKey, faabSpent } = parseTransactionData(
          tdWrapper?.transaction_data,
          txType,
        );

        all.push({
          yahoo_transaction_id: `${txKey}_p${idx}`,
          transaction_type: resolvedType,
          player_id: playerKey ?? null,
          player_name: playerName,
          player_position: displayPosition ?? null,
          team_key: teamKey,
          faab_spent: faabSpent ?? faab,
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
