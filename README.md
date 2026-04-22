# League of Thrones

A website for a 12-team dynasty fantasy football league with salary cap, escalating keeper contracts, multi-year rookie drafts, and playoff/consolation bracket tracking that Yahoo doesn't natively support.

Yahoo remains the source of truth for live rosters, scoring, and transactions. This site is the metadata layer on top: contracts, keeper costs, draft pick inventory, trade history, and the league record book.

## Tech Stack

- **Framework:** Next.js (App Router) + TypeScript
- **Database + Auth:** Supabase (Postgres)
- **Hosting:** Vercel
- **External API:** Yahoo Fantasy Sports (OAuth 2.0)
- **Import tooling:** Python (one-time Google Sheet migration)

## Project Status

Phase 0 — Foundation. See `/docs/brief.md` for the full project brief and phased milestones.

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- A Supabase project (free tier is fine)
- Python 3.11+ (only needed for the one-time Sheet import)

### First-time setup

```bash
# Clone
git clone https://github.com/glewisaz/League-of-Thrones-App.git
cd League-of-Thrones-App

# Install deps
npm install

# Copy env template and fill in values
cp .env.example .env.local
```

You'll need these env vars in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` — from your Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never commit
- `YAHOO_CLIENT_ID` — from developer.yahoo.com
- `YAHOO_CLIENT_SECRET` — server-side only

### Run the dev server

```bash
npm run dev
```

Open http://localhost:3000.

### Run tests

```bash
npm test
```

### Database migrations

Schema lives in `/supabase/migrations`. Apply with the Supabase CLI:

```bash
supabase db push
```

## Working Across Machines

This repo gets worked on from a desktop and a laptop. Rhythm to avoid pain:

**Before stopping on one machine:**
```bash
git status        # anything uncommitted?
git add .
git commit -m "wip: what I was doing"
git push
```

**Before starting on the other machine:**
```bash
git pull
```

If `git pull` ever complains about conflicts, stop and ask Claude before forcing anything.

## Project Structure

```
/app              Next.js App Router pages
/components       Shared React components
/lib              Business logic (contracts, keeper math, etc.)
/lib/yahoo        Yahoo API client + OAuth
/lib/supabase     Supabase client setup
/supabase         Schema migrations + seed data
/scripts          One-off scripts (Sheet importer, etc.)
/docs             Project brief, rules reference
```

## Key Principles

1. **Yahoo is the source of truth for rosters. The site is the source of truth for contracts.** These never overlap.
2. **Data entry must be fast.** Commissioner workflows are optimized for speed.
3. **Sync reconciles, never overwrites contract data.** Mismatches surface in the admin dashboard; they don't self-heal.
4. **Public site is read-only and cache-friendly.**
5. **The admin panel is the product.** If it's a joy to use, the site stays fresh.

## Commissioner Access

Single-user admin. Magic link auth via Supabase. The admin panel is referred to in-app as "The Small Council."

## License

Private project. Not licensed for reuse.