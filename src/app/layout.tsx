import type { Metadata } from 'next';
import { Figtree, DM_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
});

export const metadata: Metadata = {
  title: 'League of Thrones',
  description: 'Dynasty fantasy football — contracts, keepers, draft picks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${dmMono.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <header className="border-b border-neutral-800 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Link
              href="/"
              className="text-xl font-semibold tracking-tight text-accent hover:text-accent/80 transition-colors"
            >
              ♛ League of Thrones
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link
                href="/transactions"
                className="text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                The Raven
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-800 px-6 py-4 text-xs text-neutral-600 flex items-center justify-between">
          <span>League of Thrones · 2025 Season</span>
          <Link href="/admin/login" className="text-neutral-800 hover:text-neutral-700 transition-colors">
            Small Council
          </Link>
        </footer>
      </body>
    </html>
  );
}
