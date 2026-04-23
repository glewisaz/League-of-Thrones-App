import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';

type ContractUpdate = {
  id: string;
  current_season_cost: number | null;
  acquisition_type: string;
  contract_year: number;
  status: string;
};

export async function PATCH(request: Request) {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const contracts: ContractUpdate[] = body.contracts ?? [];

  if (!Array.isArray(contracts) || contracts.length === 0) {
    return NextResponse.json({ error: 'No contracts provided' }, { status: 400 });
  }

  const admin = createAdminClient();
  const errors: string[] = [];

  for (const { id, current_season_cost, acquisition_type, contract_year, status } of contracts) {
    const { error } = await admin
      .from('contracts')
      .update({ current_season_cost, acquisition_type, contract_year, status })
      .eq('id', id);
    if (error) errors.push(`${id}: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
