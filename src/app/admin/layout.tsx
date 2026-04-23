import { createSessionClient } from '@/lib/supabase/ssr-server';
import AdminNav from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // No session: render bare children so /admin/login can display without a sidebar
  // (each protected page does its own redirect to /admin/login)
  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="flex">
      <aside className="w-52 shrink-0 min-h-screen border-r border-neutral-800 bg-neutral-950">
        <AdminNav />
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
