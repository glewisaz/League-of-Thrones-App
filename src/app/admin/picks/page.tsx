import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';
import PicksEditor, { type PickRow, type TeamOption } from './PicksEditor';

export default async function AdminPicksPage() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/admin/login');

  const admin = createAdminClient();

  const [{ data: picks, error: picksError }, { data: teams, error: teamsError }] =
    await Promise.all([
      admin
        .from('draft_picks')
        .select(
          `id, season, round, pick_number, original_team_id, current_team_id, pick_type, is_used, notes,
           original_team:teams!original_team_id(id, name, owner_name),
           current_team:teams!current_team_id(id, name, owner_name)`,
        )
        .order('season')
        .order('pick_type')
        .order('original_team_id'),
      admin.from('teams').select('id, name, owner_name').order('owner_name'),
    ]);

  if (picksError) throw picksError;
  if (teamsError) throw teamsError;

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e8eaf0]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Small Council</p>
          <h1 className="text-2xl font-bold text-[#00E5FF]">Draft Pick Inventory</h1>
          <p className="text-sm text-neutral-500 mt-1">
            No picks yet?{' '}
            <a href="/api/admin/picks/seed" className="text-[#00E5FF] hover:underline">
              Seed 2026–2028 picks
            </a>
          </p>
        </div>

        <PicksEditor
          initialPicks={(picks ?? []) as unknown as PickRow[]}
          teams={(teams ?? []) as TeamOption[]}
        />
      </div>
    </div>
  );
}
