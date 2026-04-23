import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSessionClient } from '@/lib/supabase/ssr-server';

const ADMIN_LINKS = [
  { label: 'Teams', href: '/admin/teams', desc: 'Edit owner names and conference assignments' },
  { label: 'Contracts', href: '/admin/contracts', desc: 'Enter and edit player contract data' },
  { label: 'Picks', href: '/admin/picks', desc: 'Manage draft pick inventory and trades' },
  { label: 'Trades', href: '/admin/trades', desc: 'Record multi-asset trades' },
  { label: 'Yahoo Sync', href: '/admin/yahoo', desc: 'Sync rosters and transactions from Yahoo' },
];

export default async function AdminDashboard() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/admin/login');

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e8eaf0]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Small Council</p>
          <h1 className="text-2xl font-bold text-[#00E5FF]">Dashboard</h1>
        </div>

        <div className="grid gap-3">
          {ADMIN_LINKS.map(({ label, href, desc }) => (
            <Link
              key={href}
              href={href}
              className="block bg-neutral-900 border border-neutral-800 rounded-lg px-5 py-4 hover:border-[#00E5FF]/30 hover:bg-neutral-800/60 transition-all group"
            >
              <p className="font-medium text-neutral-100 group-hover:text-[#00E5FF] transition-colors">
                {label}
              </p>
              <p className="text-sm text-neutral-500 mt-0.5">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
