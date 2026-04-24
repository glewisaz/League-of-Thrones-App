import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';

function nextSeasonCost(current: number): number {
  return Math.round((current + 2) * 1.05);
}

export async function POST() {
  const session_client = await createSessionClient();
  const {
    data: { session },
  } = await session_client.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: contracts, error: fetchError } = await admin
    .from('contracts')
    .select('id, contract_year, current_season_cost, year_one_price')
    .eq('status', 'active');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const toExpire: string[] = [];
  const toAdvance: { id: string; contract_year: number; current_season_cost: number }[] = [];

  for (const c of contracts ?? []) {
    if (c.contract_year >= 4) {
      toExpire.push(c.id);
    } else {
      // Use stored current_season_cost; fall back to year_one_price if null
      const baseCost = (c.current_season_cost as number | null) ?? (c.year_one_price as number);
      toAdvance.push({
        id: c.id,
        contract_year: (c.contract_year as number) + 1,
        current_season_cost: nextSeasonCost(baseCost),
      });
    }
  }

  const errors: string[] = [];

  if (toExpire.length > 0) {
    const { error } = await admin
      .from('contracts')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .in('id', toExpire);
    if (error) errors.push(`expire: ${error.message}`);
  }

  for (const row of toAdvance) {
    const { error } = await admin
      .from('contracts')
      .update({
        contract_year: row.contract_year,
        current_season_cost: row.current_season_cost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) errors.push(`advance ${row.id}: ${error.message}`);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    expired: toExpire.length,
    advanced: toAdvance.length,
    ...(errors.length > 0 && { errors }),
  });
}
