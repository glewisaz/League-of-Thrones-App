/**
 * Yahoo Fantasy API JSON parsing helpers.
 *
 * Yahoo's JSON format has two unusual conventions that appear everywhere:
 *
 * 1. Info arrays — resource attributes are spread across an array of
 *    single-key objects rather than a flat object:
 *      [ {"player_key": "nfl.p.123"}, {"name": {...}}, {"display_position": "QB"} ]
 *    Use findInArray to extract a value by key from one of these arrays.
 *
 * 2. Numeric-key objects — collections (players, transactions, teams) are
 *    returned as objects with string numeric keys plus a "count" field:
 *      { "0": {...}, "1": {...}, "count": 2 }
 *    Use iterateYahooObject to convert these into a plain array.
 */

/**
 * Find the value for `key` in a Yahoo info structure.
 *
 * Yahoo is inconsistent — most endpoints (player, team, transaction) return
 * an array of single-key objects, but some (game, league summary in the
 * /games/leagues endpoint) return a single flat object instead. We handle
 * both so callers don't have to guess which shape they got.
 */
export function findInArray(arr: unknown, key: string): unknown {
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (item && typeof item === 'object' && key in (item as object)) {
        return (item as Record<string, unknown>)[key];
      }
    }
    return undefined;
  }
  if (arr && typeof arr === 'object' && key in (arr as object)) {
    return (arr as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * Convert a Yahoo numeric-key collection object into a plain array.
 * Yahoo encodes collections as `{ "0": x, "1": y, "count": "2" }` — the
 * count value is a string, not a number, so parseInt is required.
 */
export function iterateYahooObject(obj: Record<string, unknown>): unknown[] {
  const count = parseInt((obj.count as string) ?? '0', 10);
  const results: unknown[] = [];
  for (let i = 0; i < count; i++) {
    if (obj[i] !== undefined) results.push(obj[i]);
  }
  return results;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
