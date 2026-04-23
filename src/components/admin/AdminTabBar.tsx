'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  ArrowLeftRight,
} from 'lucide-react';

const TABS = [
  { href: '/admin',           label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/teams',     label: 'Teams',     Icon: Users           },
  { href: '/admin/contracts', label: 'Contracts', Icon: FileText        },
  { href: '/admin/picks',     label: 'Picks',     Icon: Calendar        },
  { href: '/admin/trades',    label: 'Trades',    Icon: ArrowLeftRight  },
];

export default function AdminTabBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-neutral-950 border-t border-neutral-800 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[44px] text-[11px] font-medium transition-colors ${
              active ? 'text-cyan-400' : 'text-neutral-600 hover:text-neutral-400'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.5} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
