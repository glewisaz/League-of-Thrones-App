/**
 * Yahoo Fantasy API JSON parsing helpers.
 *
 * Yahoo returns resources as arrays of single-key objects, e.g.:
 *   [ {"player_key": "nfl.p.123"}, {"name": {...}}, {"display_position": "QB"} ]
 *
 * findInArray scans one of these arrays for a given key and returns its value.
 * iterateYahooObject turns { "0": x, "1": y, "count": 2 } into [x, y].
 */

export function findInArray(arr: unknown[], key: string): unknown {
  for (const item of arr) {
    if (item && typeof item === 'object' && key in (item as object)) {
      return (item as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

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
