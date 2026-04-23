import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';

const DRAFT_SEASONS = [2026, 2027, 2028];

export async function GET() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Ensure draft seasons exist (safe upsert — defaults cover auction_cap/faab_cap)
  for (const year of DRAFT_SEASONS) {
    await admin.from('seasons').upsert({ year }, { onConflict: 'year', ignoreDuplicates: true });
  }

  const { data: teams, error: teamsError } = await admin
    .from('teams')
    .select('id')
    .order('id');
  if (teamsError) throw teamsError;
  if (!teams || teams.length === 0) {
    return NextResponse.json({ error: 'No teams found — run sync-teams first' }, { status: 400 });
  }

  // Fetch existing rookie round-1 picks so we don't double-insert
  const { data: existing } = await admin
    .from('draft_picks')
    .select('season, original_team_id')
    .in('season', DRAFT_SEASONS)
    .eq('round', 1)
    .eq('pick_type', 'rookie');

  const existingSet = new Set(
    (existing ?? []).map((r) => `${r.season}:${r.original_team_id}`),
  );

  const toInsert: {
    season: number;
    round: number;
    pick_type: string;
    original_team_id: string;
    current_team_id: string;
    is_used: boolean;
  }[] = [];

  for (const season of DRAFT_SEASONS) {
    for (const team of teams) {
      const key = `${season}:${team.id}`;
      if (!existingSet.has(key)) {
        toInsert.push({
          season,
          round: 1,
          pick_type: 'rookie',
          original_team_id: team.id,
          current_team_id: team.id,
          is_used: false,
        });
      }
    }
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, created: 0, message: 'All picks already exist' });
  }

  const { error: insertError } = await admin.from('draft_picks').insert(toInsert);
  if (insertError) throw insertError;

  return NextResponse.json({
    ok: true,
    created: toInsert.length,
    seasons: DRAFT_SEASONS,
    teams: teams.length,
  });
}
