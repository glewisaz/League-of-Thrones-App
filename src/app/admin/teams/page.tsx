import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';
import TeamsForm, { type TeamRow } from './TeamsForm';

export default async function AdminTeamsPage() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: teams, error } = await admin
    .from('teams')
    .select('id, name, owner_name, conference')
    .eq('is_ghost', false)
    .order('name');
  if (error) throw error;

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e8eaf0]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Small Council</p>
          <h1 className="text-2xl font-bold text-[#00E5FF]">Team Settings</h1>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <TeamsForm initialTeams={(teams ?? []) as TeamRow[]} />
        </div>
      </div>
    </div>
  );
}
