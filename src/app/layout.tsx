import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'League of Thrones',
  description: 'Dynasty fantasy football — contracts, keepers, draft picks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100 antialiased">
        <header className="border-b border-neutral-800 px-6 py-4">
          <div className="max-w-5xl mx-auto">
            <Link
              href="/"
              className="text-xl font-semibold tracking-tight text-amber-400 hover:text-amber-300 transition-colors"
            >
              ♛ League of Thrones
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-800 px-6 py-4 text-center text-xs text-neutral-600">
          League of Thrones · 2025 Season
        </footer>
      </body>
    </html>
  );
}
