'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Teams', href: '/admin/teams' },
  { label: 'Contracts', href: '/admin/contracts' },
  { label: 'Picks', href: '/admin/picks' },
  { label: 'Trades', href: '/admin/trades' },
  { label: 'Yahoo Sync', href: '/admin/yahoo' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <nav className="hidden md:flex flex-col h-full p-4">
      <div className="mb-6 px-1">
        <p className="text-xs text-neutral-600 uppercase tracking-widest font-medium">
          Small Council
        </p>
      </div>

      <ul className="flex-1 space-y-0.5">
        {NAV_ITEMS.map(({ label, href }) => {
          const isActive =
            href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`block px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-[#00E5FF]/10 text-[#00E5FF] font-medium'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="pt-4 border-t border-neutral-800">
        <button
          onClick={handleSignOut}
          className="w-full px-3 py-2 text-left text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
