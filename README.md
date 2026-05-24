# League of Thrones

Dynasty fantasy football league site — the metadata layer Yahoo refuses to provide.

## What it does
- Contract tracking with keeper cost formula
- Draft pick inventory with trade history
- Transaction feed (The Raven) pulled from Yahoo API
- Record book (The White Book)
- Commissioner admin panel (The Small Council)

## Tech stack
- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Auth)
- Vercel (hosting + deploys)
- Yahoo Fantasy Sports API (OAuth 2.0)

## Local development
1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in values
3. `npm install`
4. `npm run dev`

## Environment variables needed
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- YAHOO_CLIENT_ID
- YAHOO_CLIENT_SECRET
- YAHOO_REDIRECT_URI

## Yahoo API setup
1. Register app at developer.yahoo.com
2. Set callback URL to `{your-domain}/api/yahoo/callback`
3. Select Fantasy Sports → Read permission
4. Run OAuth flow at `/api/yahoo/connect`
5. Set `league_key` in `yahoo_auth` table (format: `461.l.708208`)

## Database migrations
Migrations live as plain SQL files in `supabase/migrations/`. They are not
applied automatically — push them up via the Supabase CLI:

```bash
# One-time setup
npm i -g supabase                              # install the CLI
supabase login                                 # browser auth, opens once
supabase link --project-ref <project-ref>      # from your dashboard URL

# Every time you add a new migration
supabase db push                               # diffs local vs remote, applies new files
```

`supabase db push` is idempotent — files that were applied before are skipped.

## Sync order (first time setup)
1. `/api/yahoo/sync-teams`
2. `/api/yahoo/sync-rosters`
3. `/api/yahoo/sync-transactions`
4. `/api/admin/picks/seed`

## Historical Yahoo backfill
After migration `0006` is applied, the Small Council can backfill prior seasons
from `/admin/history` — discover leagues, map teams, then sync standings,
matchups, champion, and rosters per season.

## Key league rules
- Keeper formula: `next_year_cost = round((current_season_cost + 2) * 1.05)`
- Max 4 contract years — expires after year 4
- $200 auction cap, $100 FAAB per season
- 2 conferences (North/South), 6 teams each
- Rookie draft picks 1–12, supplemental picks 13+

## Admin panel
Protected at `/admin` — requires Supabase Auth login.
Commissioner account set up via Supabase Dashboard → Authentication → Users.

## Working across machines
```bash
# Before stopping
git add . && git commit -m "wip: what I was doing" && git push

# Before starting
git pull
```

## License
Private project. Not licensed for reuse.
