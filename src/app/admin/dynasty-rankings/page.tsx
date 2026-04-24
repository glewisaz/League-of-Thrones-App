import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';
import DynastyRankingsEditor from './DynastyRankingsEditor';

export default async function DynastyRankingsPage() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/admin/login');

  const admin = createAdminClient();
  const { count } = await admin
    .from('dynasty_rankings')
    .select('*', { count: 'exact', head: true });

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e8eaf0]">
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="mb-8">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Small Council</p>
          <h1 className="text-2xl font-bold text-[#00E5FF]">Dynasty Rankings</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Paste a ranked CSV to update the dynasty free-agent list shown on the home page.
          </p>
        </div>

        <DynastyRankingsEditor currentCount={count ?? 0} />
      </div>
    </div>
  );
}
