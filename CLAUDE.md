# League of Thrones — Claude Code Context

## Project type
Next.js 15 App Router + Supabase + Vercel. TypeScript throughout.

## Key architectural decisions
- Yahoo is source of truth for rosters. This app is source of truth for contracts.
- Never auto-resolve contract mismatches — flag them for commissioner review.
- `current_season_cost` stores the actual season cost directly (not computed from `year_one_price` iteratively). `next_year_cost = round((current_season_cost + 2) * 1.05)`.
- All admin routes use `createAdminClient` (service role) not the anon client.
- Public pages use ISR/revalidate, not force-dynamic (except transactions).

## Database patterns
- Teams upsert on slug conflict — never overwrite `owner_name` or `conference`
- Contracts upsert on `yahoo_transaction_id` conflict
- Always use `!left` joins when joining contracts to players (many contracts have no player match yet — they live in `unmatched_players` until Yahoo IDs are resolved)
- Active season determined by `seasons.is_active = true`

## Yahoo API quirks
- Responses default to XML — always append `?format=json`
- Numeric string keys (`"0"`, `"1"`, `"count"`) — use `iterateYahooObject()` and `findInArray()` from `src/lib/yahoo/parse.ts`
- Player data path: `transaction[1].players["0"].player[0]` is the outer info array, `player[0][0]` is the flat single-key objects array
- Token expires in 1 hour — `getValidToken()` auto-refreshes if within 5 min of expiry
- League key format: `{game_key}.l.{league_id}` e.g. `461.l.708208`
- Game keys by season: 2018=380, 2019=390, 2020=399, 2021=406, 2022=414, 2023=423, 2024=449, 2025=461

## Known data quirks (from original spreadsheet import)
- Roster cap is 20 (9 starters + 7 bench + 4 IR), not 17
- Playoffs are weeks 15–17, not 14–16
- `acquisition_type` defaults to `auction` on sync-rosters — waiver pickups need manual correction in the admin panel
- Player names in `unmatched_players` have typos from the spreadsheet (e.g. "Cj Stroud", "Saquan Barkley")
- DSTs stored as team abbreviation only ("MIN", "GB") — not keeper assets, never get contracts

## File structure
- `src/lib/yahoo/` — Yahoo API client, parsers, transaction fetcher
- `src/lib/queries/` — Supabase query helpers (teams, seasons)
- `src/app/api/yahoo/` — sync routes (teams, rosters, transactions)
- `src/app/api/admin/` — commissioner write routes
- `src/app/admin/` — Small Council pages (auth-gated)
- `src/components/admin/` — AdminNav, AdminTabBar

## Theming
- Dark mode default, background `#0a0c10`
- Accent: `#00E5FF` (cyan)
- Fonts: Figtree (sans, all text), DM Mono (numbers only, `.num` class)
- `tabular-nums` on all numeric columns

## Do not
- Never run sync-teams without confirming it won't overwrite `owner_name`/`conference`
- Never add `force-dynamic` to record book or standings (`revalidate = 3600` instead)
- Never auto-expire contracts — always require commissioner confirmation
- Never hardcode season years — use `getActiveSeason()` from `src/lib/queries/seasons.ts`
- Never keep decimals through keeper cost calculations — the formula rounds at each step

## Full project spec
See `league-of-thrones-project-brief.md` in the project root for the complete requirements document.
