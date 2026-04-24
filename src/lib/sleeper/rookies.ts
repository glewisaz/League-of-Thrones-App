import { createAdminClient } from '@/lib/supabase/admin';

export type SleeperRookie = {
  name: string;
  position: string;
  team: string | null;
  search_rank: number;
};

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Fetch true 2026 rookie prospects from Sleeper's public player database.
 *
 * Filters:
 *   - years_exp === 0, active, on an NFL team, skill position, ranked < 9999
 *   - Name not found in the `players` table — anyone already there was in last
 *     year's Yahoo pool and is a returning vet/IR holdover, not a true rookie
 *
 * Both the Sleeper fetch and DB lookup run in parallel and are cached 24h.
 */
export async function fetchRookies(count = 15): Promise<SleeperRookie[]> {
  const supabase = createAdminClient();

  const [sleeperRes, { data: existingPlayers }] = await Promise.all([
    fetch('https://api.sleeper.app/v1/players/nfl', { next: { revalidate: 86400 } }),
    supabase.from('players').select('name'),
  ]);

  if (!sleeperRes.ok) throw new Error(`Sleeper API error: ${sleeperRes.status}`);

  const allPlayers = (await sleeperRes.json()) as Record<string, Record<string, unknown>>;

  const existingNames = new Set(
    (existingPlayers ?? []).map((p) => p.name.toLowerCase()),
  );

  return Object.values(allPlayers)
    .filter(
      (p) =>
        p.active === true &&
        p.years_exp === 0 &&
        p.team != null &&
        typeof p.position === 'string' &&
        SKILL_POSITIONS.has(p.position) &&
        typeof p.search_rank === 'number' &&
        p.search_rank < 9999 &&
        typeof p.first_name === 'string' &&
        typeof p.last_name === 'string',
    )
    .filter((p) => !existingNames.has(`${p.first_name} ${p.last_name}`.toLowerCase()))
    .sort((a, b) => (a.search_rank as number) - (b.search_rank as number))
    .slice(0, count)
    .map((p) => ({
      name: `${p.first_name} ${p.last_name}`,
      position: p.position as string,
      team: p.team as string | null,
      search_rank: p.search_rank as number,
    }));
}
