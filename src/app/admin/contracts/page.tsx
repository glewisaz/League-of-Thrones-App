import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveSeason } from '@/lib/queries/seasons';
import ContractsEditor, { type ContractRow, type TeamOption } from './ContractsEditor';

export default async function AdminContractsPage() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/admin/login');

  const admin = createAdminClient();

  const [{ data: contracts, error: contractsError }, { data: teams, error: teamsError }, season] =
    await Promise.all([
      admin
        .from('contracts')
        .select(
          'id, year_one_price, contract_year, current_season_cost, acquisition_type, status, current_team_id, players(name, position), unmatched_players(raw_name, position)',
        )
        .order('current_team_id'),
      admin.from('teams').select('id, name, owner_name').order('owner_name'),
      getActiveSeason(),
    ]);

  if (contractsError) throw contractsError;
  if (teamsError) throw teamsError;

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e8eaf0]">
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="mb-8">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Small Council</p>
          <h1 className="text-2xl font-bold text-[#00E5FF]">Contracts</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {contracts?.length ?? 0} contracts across {teams?.length ?? 0} teams
          </p>
        </div>

        <ContractsEditor
          initialContracts={(contracts ?? []) as unknown as ContractRow[]}
          teams={(teams ?? []) as TeamOption[]}
          seasonYear={season?.year ?? new Date().getFullYear()}
        />
      </div>
    </div>
  );
}
