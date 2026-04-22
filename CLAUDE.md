# League of Thrones

Fantasy football dynasty league site for a 12-team Yahoo league with salary
cap, escalating keeper contracts, multi-year rookie drafts, and a
consolation/playoff bracket Yahoo doesn't model natively.

The site is the **metadata layer Yahoo refuses to provide**: contracts,
keeper costs, draft pick inventory, record book. Yahoo is the source of
truth for live rosters, scoring, and transactions, pulled in via OAuth API.

> Full spec: see `league-of-thrones-project-brief.md` in the project root
> for the complete requirements doc this implementation is built against.

---

## Status

- ✅ **Phase 0 — Foundation:** schema migration, keeper math, importer
- ⏳ **Phase 1 — Seed + Public Read:** Next.js scaffold, team/standings pages
- ⏸ Phase 2 — Yahoo OAuth integration
- ⏸ Phase 3 — Admin panel ("The Small Council")
- ⏸ Phase 4 — Draft tools
- ⏸ Phase 5 — Polish

---

## Tech stack

- **Next.js 15** (App Router) + **TypeScript**
- **Supabase** (Postgres + Auth) — project URL in `.env.local`
- **Vercel** for hosting + cron
- **Tailwind CSS** for styling
- **Vitest** for tests

The Next.js scaffold isn't checked in yet — `npx create-next-app@latest .`
when you're ready to start Phase 1.

---

## Setup

### 1. Apply the schema migration

In the Supabase SQL editor, paste and run:
`supabase/migrations/0001_initial_schema.sql`

### 2. Import the offseason roster spreadsheet

```bash
pip install -r scripts/requirements.txt
python scripts/import_sheet.py path/to/sheet.xlsx --output-dir scripts/out
```

Two files come out:
- `scripts/out/import_report.md` — review this first; flagged anomalies
  need a human decision before applying SQL.
- `scripts/out/seed_data.sql` — paste into the Supabase SQL editor after
  the report looks right.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the Supabase keys from the
Supabase dashboard → Project Settings → API.

---

## Architecture

```
Yahoo Fantasy API (OAuth)        Commissioner admin panel
       │                                  │
       ▼                                  ▼
       └────► Supabase Postgres ◄─────────┘
                     │
                     ▼
              Next.js (public site)
```

**The split that matters:** Yahoo owns rosters, scoring, and transactions.
The site owns contracts, draft picks, and trades involving non-player
assets. They reconcile, they don't merge.

---

## Things that have bitten us (read this before changing anything)

### 1. The keeper formula iterates on rounded whole-dollar values

`next = round((current + 2) * 1.05)` — applied to the **whole-dollar**
result of the previous year, not to accumulated decimals.

If you keep decimals through the chain, a $29 Y1 contract becomes $36 in
Y3 and $40 in Y4. The actual answer is $37 and $41 (matches the league
spreadsheet). All prices are stored as `INTEGER` everywhere as a result —
no decimal columns anywhere in the schema.

The math lives in three places that must agree:
- `supabase/migrations/0001_initial_schema.sql` → `contract_cost_at_year()`
- `src/lib/contracts.ts` → `contractCostAtYear()`
- the original league spreadsheet (the source of truth)

If you change one, change all three. The Vitest tests in
`src/lib/contracts.test.ts` lock in known-good values from real owners.

### 2. The roster cap is 20, not 17

The brief says 9 starters + 7 bench + 1 IR = 17. That's wrong. Yahoo's
actual settings show **4 IR slots**, making the cap 20. Justin's tab is
exactly at cap (20), the brief's number isn't.

### 3. Playoffs are weeks 15–17, not 14–16

The brief is one week behind Yahoo's actual settings. Week 14 is regular
season, weeks 15–17 are playoffs/consolation. Schedule logic must match.

### 4. The spreadsheet has three layout variants

The importer is header-driven (searches each tab for the "Player" cell)
because three of the twelve tabs deviate from the standard layout:

- **Chav's tab** is shifted right by 10 columns (Player in column L).
- **Chris's tab** has an extra blank column between Player and Position.
- **Geoff's tab** has a phantom duplicate roster in columns N–S.
  Truncate at column L on import — anything to the right is scratch space.

Several tabs (Justin, Garrette, Chris) also have informal trade notes
("ridley 3/6", "dalvin 3/46") in far-right columns. Always ignored.

### 5. FAAB pickups become the year-one contract price

Per league rules, a waiver pickup's winning FAAB bid is the player's
acquisition price, which sticks even if dropped and re-added. **Isaac
Guerendo at $100 on Jesse's tab is correct, not a typo** — Jesse blew his
entire $100 season FAAB on one waiver claim after a Niners RB injury.

The importer flags any price > $80 for human review but does not reject.

### 6. The "Draft Picks" section also has a "Keeper" sub-column

Each owner tab has both a "Draft Picks" column (for pre-declared rookie
picks at $1) and a "Keeper" column (for tentatively declared keepers).
The importer only reads "Draft Picks". Justin's `Jordan Love(3)` at $4
sits in the Keeper column and is correctly ignored — that's a tentative
keeper note, not a draft pick.

### 7. acquisition_type is inferred and often wrong

The spreadsheet doesn't distinguish auction wins from waiver pickups from
free agents — it just stores the price. The importer uses a crude rule:

- $0 → `free_agent`
- $1 → `rookie_draft`
- $2+ → `auction`

This will be wrong for waiver pickups (FAAB > $1). Plan to fix these in
the admin panel as you find them. Guerendo at $100 is the obvious one;
there will be others.

### 8. Player names need fuzzy matching against Yahoo

Spreadsheet names have typos, inconsistent capitalization, missing
apostrophes/periods, and trailing whitespace ("Mathew Stafford", "Cj Stroud",
"Saquan Barkley", "DAndre Swift", etc.). The importer normalizes whitespace
only. The Yahoo player ID match happens in Phase 2 — every roster row
currently lands in `unmatched_players` until then.

DSTs are encoded as the team abbreviation alone ("MIN", "GB", "AZ"), with
one outlier ("CLE DEF" on Bryan's tab). Yahoo treats DSTs as a different
entity type than players; the matcher needs a special case.

### 9. team.name is intentionally NULL after import

The spreadsheet only has owner names, not team names. The schema allows
`teams.name` to be NULL; you fill those in via the admin panel later.
Slugs are derived from the owner name for now.

---

## Directory structure

```
.
├── CLAUDE.md                                  ← you are here
├── league-of-thrones-project-brief.md         ← the full spec
├── .env.example
├── .gitignore
├── vitest.config.ts
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql
├── scripts/
│   ├── import_sheet.py                        ← header-driven xlsx importer
│   ├── requirements.txt
│   └── out/                                   ← generated; gitignored
│       ├── import_report.md
│       └── seed_data.sql
└── src/
    ├── lib/
    │   ├── contracts.ts                        ← keeper math
    │   ├── contracts.test.ts
    │   ├── supabase/
    │   │   ├── client.ts                       ← browser client (anon)
    │   │   ├── server.ts                       ← server-side anon read client
    │   │   └── admin.ts                        ← service-role client (server-only)
    │   └── queries/
    │       └── teams.ts                        ← example read-query module
    └── types/
        └── database.ts                         ← schema TS types
```

After running `create-next-app`, install the runtime + dev dependencies:

```bash
npm install @supabase/ssr @supabase/supabase-js
npm install -D vitest
```

---

## Common commands

```bash
# Re-run the importer after editing the sheet
python scripts/import_sheet.py path/to/sheet.xlsx --output-dir scripts/out

# Run keeper math tests (after npm i -D vitest)
npx vitest run src/lib/contracts.test.ts

# Local Next.js dev (after create-next-app)
npm run dev
```

---

## Yahoo integration (Phase 2 preview)

- Register an app at `developer.yahoo.com`. Callback:
  `https://[your-domain]/api/yahoo/callback`.
- OAuth 2.0 authorization code flow. Tokens stored in the single-row
  `yahoo_auth` table. Access token lives 1 hour, refresh ~1 year.
- Wrapper checks expiry before every call; refreshes if <5 min remaining.
- All requests append `?format=json` (XML is the default).
- Player IDs are `nfl.p.12345`. Stash these as canonical player IDs.
- No webhooks — polling only. Vercel cron: weekly in offseason, nightly
  in-season at 3am Phoenix time.
- **Skip the `yahoo-fantasy` npm package.** Write a thin custom client
  (~150 lines) so Yahoo breakage is debuggable.

### Reconciliation, not overwrite

Yahoo doesn't know about contracts. When a sync reveals a roster change,
the system **flags** for commissioner review — it never auto-resolves
contract data. An add → new contract row + prompt for `year_one_price`
(can be inferred from FAAB on waivers, $0 on free agents, requires entry
on auction). A drop → mark contract `dropped`. A trade → flagged for
manual entry to capture non-player assets.

---

## Conventions

- All prices in INTEGER (no decimals anywhere)
- All timestamps in `timestamptz`
- UUIDs via `gen_random_uuid()` (built into Postgres 13+)
- Public site uses anon role (read-only via RLS)
- Writes go through service_role from server-side code only
- The `yahoo_auth` table has no anon read policy — tokens stay private

---

## Optional: Supabase MCP for Claude Code

There's an official Supabase MCP server that lets Claude Code talk to the
database directly (run migrations, inspect schema, query data). Setup:

```bash
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase@latest \
  --project-ref=lksaeurrnsqiscbbhxxl
```

Useful but not required. Without it, you copy-paste SQL into the Supabase
SQL editor manually.
