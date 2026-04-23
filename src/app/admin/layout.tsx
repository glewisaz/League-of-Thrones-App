import { createSessionClient } from '@/lib/supabase/ssr-server';
import AdminNav from '@/components/admin/AdminNav';
import AdminTabBar from '@/components/admin/AdminTabBar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // No session: render bare children so /admin/login can display without a sidebar
  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-52 shrink-0 min-h-screen border-r border-neutral-800 bg-neutral-950">
        <AdminNav />
      </aside>
      {/* pb-16 reserves space for the mobile tab bar; md:pb-0 removes it on desktop */}
      <div className="flex-1 min-w-0 pb-16 md:pb-0">{children}</div>
      <AdminTabBar />
    </div>
  );
}
