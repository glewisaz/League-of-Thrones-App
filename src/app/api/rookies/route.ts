import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { type SleeperRookie } from '@/lib/sleeper/rookies';

export const revalidate = 86400;

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [sleeperRes, { data: existingPlayers }] = await Promise.all([
      fetch('https://api.sleeper.app/v1/players/nfl', { next: { revalidate: 86400 } }),
      supabase.from('players').select('name'),
    ]);

    if (!sleeperRes.ok) {
      return NextResponse.json({ error: `Sleeper API error: ${sleeperRes.status}` }, { status: 502 });
    }

    const allPlayers = (await sleeperRes.json()) as Record<string, Record<string, unknown>>;

    const existingNames = new Set(
      (existingPlayers ?? []).map((p) => p.name.toLowerCase()),
    );

    const candidates = Object.values(allPlayers).filter(
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
    );

    const rookies: SleeperRookie[] = candidates
      .filter((p) => {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        return !existingNames.has(fullName);
      })
      .sort((a, b) => (a.search_rank as number) - (b.search_rank as number))
      .slice(0, 15)
      .map((p) => ({
        name: `${p.first_name} ${p.last_name}`,
        position: p.position as string,
        team: p.team as string,
        search_rank: p.search_rank as number,
      }));

    return NextResponse.json({ rookies });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
