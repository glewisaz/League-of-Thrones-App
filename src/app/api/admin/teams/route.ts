import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: Request) {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const teams: { id: string; owner_name: string; conference: string | null }[] =
    body.teams ?? [];

  if (!Array.isArray(teams) || teams.length === 0) {
    return NextResponse.json({ error: 'No teams provided' }, { status: 400 });
  }

  const admin = createAdminClient();
  const errors: string[] = [];

  for (const { id, owner_name, conference } of teams) {
    const { error } = await admin
      .from('teams')
      .update({ owner_name, conference: conference || null })
      .eq('id', id);
    if (error) errors.push(`${id}: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
