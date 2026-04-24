import { NextRequest, NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';

type RankingRow = { rank: number; player_name: string; position: string };

function parseCsv(raw: string): RankingRow[] {
  const lines = raw.trim().split(/\r?\n/);
  const rows: RankingRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(',').map((s) => s.trim());
    if (parts.length < 3) continue;

    const rank = parseInt(parts[0], 10);
    if (isNaN(rank)) continue; // skip header row

    const player_name = parts[1];
    const position = parts[2].toUpperCase();
    if (!player_name || !position) continue;

    rows.push({ rank, player_name, position });
  }

  return rows;
}

export async function POST(req: NextRequest) {
  const session_client = await createSessionClient();
  const {
    data: { session },
  } = await session_client.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { csv } = (await req.json()) as { csv: string };
  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'Missing csv field' }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows parsed from CSV' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Replace all rows atomically: delete then insert
  const { error: deleteError } = await admin.from('dynasty_rankings').delete().gte('rank', 0);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await admin.from('dynasty_rankings').insert(rows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ imported: rows.length });
}
