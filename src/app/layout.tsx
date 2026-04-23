import type { Metadata } from 'next';
import { Figtree, DM_Mono } from 'next/font/google';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { getActiveSeason } from '@/lib/queries/seasons';
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
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏈</text></svg>",
  },
  openGraph: {
    title: 'League of Thrones',
    description: 'Dynasty fantasy football — contracts, keepers, and the Iron Football.',
    url: 'https://lot.geelew.com',
    images: [{ url: 'https://lot.geelew.com/og-image.svg', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'League of Thrones',
    description: 'Dynasty fantasy football — contracts, keepers, and the Iron Football.',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const season = await getActiveSeason();
  const seasonYear = season?.year ?? new Date().getFullYear();
  return (
    <html lang="en" className={`${figtree.variable} ${dmMono.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-800 px-4 md:px-6 py-4 text-xs text-neutral-600 flex items-center justify-between">
          <span>League of Thrones · {seasonYear} Season</span>
          <Link href="/admin/login" className="text-neutral-800 hover:text-neutral-700 transition-colors">
            Small Council
          </Link>
        </footer>
      </body>
    </html>
  );
}
