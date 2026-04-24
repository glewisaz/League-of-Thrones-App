export type SleeperRookie = {
  name: string;
  position: string;
  team: string | null;
  search_rank: number;
};

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Fetch top rookie prospects from Sleeper's public player database.
 *
 * Sleeper returns all ~2000 NFL players in one payload keyed by player_id.
 * We filter to years_exp === 0 (first-year players) + active + skill positions,
 * then sort by search_rank (Sleeper's overall prospect ranking, lower = better).
 *
 * The fetch is cached for 24 hours at the Next.js layer — rookie rosters
 * don't change meaningfully day-to-day once the draft is over.
 */
export async function fetchRookies(count = 15): Promise<SleeperRookie[]> {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);

  const data = (await res.json()) as Record<
    string,
    {
      full_name?: string;
      position?: string;
      team?: string | null;
      years_exp?: number | null;
      active?: boolean;
      search_rank?: number | null;
    }
  >;

  return Object.values(data)
    .filter(
      (p) =>
        p.years_exp === 0 &&
        p.active === true &&
        p.position != null &&
        SKILL_POSITIONS.has(p.position) &&
        p.full_name != null &&
        p.search_rank != null,
    )
    .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))
    .slice(0, count)
    .map((p) => ({
      name: p.full_name!,
      position: p.position!,
      team: p.team ?? null,
      search_rank: p.search_rank!,
    }));
}
