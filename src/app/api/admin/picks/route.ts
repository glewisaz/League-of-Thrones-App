import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: Request) {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const picks: { id: string; current_team_id: string; pick_number?: number | null; notes?: string | null }[] =
    body.picks ?? [];

  if (!Array.isArray(picks) || picks.length === 0) {
    return NextResponse.json({ error: 'No picks provided' }, { status: 400 });
  }

  const admin = createAdminClient();
  const errors: string[] = [];

  for (const { id, current_team_id, pick_number, notes } of picks) {
    const update: Record<string, unknown> = { current_team_id };
    if (pick_number !== undefined) update.pick_number = pick_number;
    if (notes !== undefined) update.notes = notes;

    const { error } = await admin.from('draft_picks').update(update).eq('id', id);
    if (error) errors.push(`${id}: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { season, original_team_id } = body as { season: number; original_team_id: string };

  if (!season || !original_team_id) {
    return NextResponse.json({ error: 'season and original_team_id are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('draft_picks')
    .insert({
      season,
      round: 1,
      pick_type: 'supplemental',
      original_team_id,
      current_team_id: original_team_id,
      is_used: false,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
