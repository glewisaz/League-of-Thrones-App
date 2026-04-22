-- League of Thrones — Initial Schema
-- Migration: 0001
--
-- Conventions (see CLAUDE.md for rationale):
--   * All prices are INTEGER (whole dollars). The keeper formula iterates
--     on rounded whole-dollar values, not on accumulated decimals.
--   * UUID PKs use gen_random_uuid() (built into Postgres 13+).
--   * All timestamps are timestamptz.
--   * RLS is enabled on every table. anon role gets SELECT on public-readable
--     tables. Writes happen through service_role (server-only) until proper
--     commissioner auth is added.
-- =========================================================================

-- =========================================================================
-- ENUMS
-- =========================================================================

CREATE TYPE conference         AS ENUM ('north', 'south');
CREATE TYPE acquisition_type   AS ENUM ('auction', 'rookie_draft', 'waiver', 'free_agent', 'trade_inherited');
CREATE TYPE contract_status    AS ENUM ('active', 'expired', 'dropped', 'traded_away');
CREATE TYPE pick_type          AS ENUM ('rookie', 'supplemental');
CREATE TYPE trade_status       AS ENUM ('completed', 'voided');
CREATE TYPE trade_asset_type   AS ENUM ('contract', 'draft_pick', 'faab');
CREATE TYPE bracket            AS ENUM ('playoffs', 'consolation');
CREATE TYPE transaction_type   AS ENUM ('add', 'drop', 'trade', 'commish');
CREATE TYPE sync_status        AS ENUM ('success', 'partial', 'failed');

-- =========================================================================
-- KEEPER COST FUNCTION
-- =========================================================================
-- next = ROUND((current + 2) * 1.05), iterated on rounded whole-dollar values.
-- Verified against the league spreadsheet across multiple owners.

CREATE OR REPLACE FUNCTION contract_cost_at_year(year_one_price INT, target_year INT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cost NUMERIC;
  i INT;
BEGIN
  IF target_year IS NULL OR target_year < 1 OR target_year > 4 THEN
    RETURN NULL;
  END IF;
  IF year_one_price IS NULL OR year_one_price < 0 THEN
    RETURN NULL;
  END IF;
  cost := year_one_price;
  FOR i IN 2..target_year LOOP
    cost := ROUND((cost + 2) * 1.05);
  END LOOP;
  RETURN cost::INT;
END;
$$;

-- =========================================================================
-- updated_at TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- TABLES
-- =========================================================================

CREATE TABLE seasons (
  year         INT PRIMARY KEY,
  auction_cap  INT NOT NULL DEFAULT 200,
  faab_cap     INT NOT NULL DEFAULT 100,
  is_active    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT,                          -- nullable; filled in via admin
  owner_name  TEXT NOT NULL,
  conference  conference,                    -- nullable until you assign divisions
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE players (
  yahoo_player_id  TEXT PRIMARY KEY,         -- e.g. 'nfl.p.12345'
  name             TEXT NOT NULL,
  position         TEXT,
  nfl_team         TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Holding table for spreadsheet rows whose Yahoo player ID hasn't been
-- confirmed yet. Resolved via the admin UI once Yahoo OAuth is connected.
CREATE TABLE unmatched_players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name            TEXT NOT NULL,
  position            TEXT,
  source              TEXT NOT NULL,         -- e.g. 'sheet_import_2025_offseason'
  resolved_player_id  TEXT REFERENCES players(yahoo_player_id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contracts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Either player_id OR unmatched_player_id is set, never both null:
  player_id            TEXT REFERENCES players(yahoo_player_id),
  unmatched_player_id  UUID REFERENCES unmatched_players(id),
  current_team_id      UUID NOT NULL REFERENCES teams(id),
  original_team_id     UUID REFERENCES teams(id),
  acquisition_season   INT  NOT NULL REFERENCES seasons(year),
  acquisition_type     acquisition_type NOT NULL,
  year_one_price       INT  NOT NULL CHECK (year_one_price >= 0),
  contract_year        INT  NOT NULL CHECK (contract_year BETWEEN 1 AND 4),
  status               contract_status NOT NULL DEFAULT 'active',
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (player_id IS NOT NULL OR unmatched_player_id IS NOT NULL)
);

CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX contracts_current_team_idx ON contracts(current_team_id);
CREATE INDEX contracts_player_idx       ON contracts(player_id);
CREATE INDEX contracts_status_idx       ON contracts(status);

-- Convenience view: every contract with computed current/next year cost.
CREATE VIEW contracts_with_costs AS
SELECT
  c.*,
  contract_cost_at_year(c.year_one_price, c.contract_year)        AS current_year_cost,
  CASE WHEN c.contract_year < 4
    THEN contract_cost_at_year(c.year_one_price, c.contract_year + 1)
    ELSE NULL
  END                                                              AS next_year_cost,
  (c.contract_year >= 4)                                           AS is_expiring
FROM contracts c;

CREATE TABLE draft_picks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season              INT  NOT NULL REFERENCES seasons(year),
  round               INT  NOT NULL DEFAULT 1,
  pick_number         INT,                                         -- filled in after lottery
  original_team_id    UUID NOT NULL REFERENCES teams(id),
  current_team_id     UUID NOT NULL REFERENCES teams(id),
  pick_type           pick_type NOT NULL DEFAULT 'rookie',
  is_used             BOOLEAN NOT NULL DEFAULT FALSE,
  used_on_player_id   TEXT REFERENCES players(yahoo_player_id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX draft_picks_season_idx       ON draft_picks(season);
CREATE INDEX draft_picks_current_team_idx ON draft_picks(current_team_id);

CREATE TABLE trades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date  DATE NOT NULL,
  season      INT  NOT NULL REFERENCES seasons(year),
  notes       TEXT,
  status      trade_status NOT NULL DEFAULT 'completed',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trade_assets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id       UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  from_team_id   UUID NOT NULL REFERENCES teams(id),
  to_team_id     UUID NOT NULL REFERENCES teams(id),
  asset_type     trade_asset_type NOT NULL,
  contract_id    UUID REFERENCES contracts(id),
  draft_pick_id  UUID REFERENCES draft_picks(id),
  faab_amount    INT,
  CHECK (
    (asset_type = 'contract'   AND contract_id   IS NOT NULL) OR
    (asset_type = 'draft_pick' AND draft_pick_id IS NOT NULL) OR
    (asset_type = 'faab'       AND faab_amount   IS NOT NULL)
  )
);

CREATE INDEX trade_assets_trade_idx ON trade_assets(trade_id);

CREATE TABLE standings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season           INT  NOT NULL REFERENCES seasons(year),
  team_id          UUID NOT NULL REFERENCES teams(id),
  wins             INT  NOT NULL DEFAULT 0,
  losses           INT  NOT NULL DEFAULT 0,
  ties             INT  NOT NULL DEFAULT 0,
  points_for       NUMERIC(10,2) NOT NULL DEFAULT 0,
  points_against   NUMERIC(10,2) NOT NULL DEFAULT 0,
  seed             INT,
  bracket          bracket,
  final_placement  INT CHECK (final_placement BETWEEN 1 AND 12),
  UNIQUE (season, team_id)
);

CREATE INDEX standings_season_idx ON standings(season);

CREATE TABLE champions (
  season               INT PRIMARY KEY REFERENCES seasons(year),
  champion_team_id     UUID NOT NULL REFERENCES teams(id),
  runner_up_team_id    UUID REFERENCES teams(id),
  north_crown_team_id  UUID REFERENCES teams(id),
  south_crown_team_id  UUID REFERENCES teams(id),
  notes                TEXT
);

CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yahoo_transaction_id  TEXT UNIQUE,
  season                INT  NOT NULL REFERENCES seasons(year),
  week                  INT,
  team_id               UUID REFERENCES teams(id),
  transaction_type      transaction_type NOT NULL,
  player_id             TEXT REFERENCES players(yahoo_player_id),
  faab_spent            INT,
  raw_payload           JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transactions_season_week_idx ON transactions(season, week);
CREATE INDEX transactions_team_idx        ON transactions(team_id);

-- Single-row table; CHECK constraint ensures only id=1 is ever inserted.
CREATE TABLE yahoo_auth (
  id             INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token   TEXT,
  refresh_token  TEXT,
  expires_at     TIMESTAMPTZ,
  league_key     TEXT,
  game_key       TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER yahoo_auth_set_updated_at
  BEFORE UPDATE ON yahoo_auth
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sync_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type          TEXT NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  status             sync_status,
  records_processed  INT,
  errors             JSONB
);

CREATE INDEX sync_log_started_idx ON sync_log(started_at DESC);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================
-- Public site is read-only for anon. yahoo_auth is NEVER readable by anon
-- (no policy granted) — it holds OAuth tokens.
-- service_role bypasses RLS, used by Next.js server actions / cron jobs.

ALTER TABLE seasons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE players             ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmatched_players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_assets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE champions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE yahoo_auth          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log            ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_read_seasons        ON seasons            FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_teams          ON teams              FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_players        ON players            FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_unmatched      ON unmatched_players  FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_contracts      ON contracts          FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_draft_picks    ON draft_picks        FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_trades         ON trades             FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_trade_assets   ON trade_assets       FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_standings      ON standings          FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_champions      ON champions          FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_transactions   ON transactions       FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_sync_log       ON sync_log           FOR SELECT TO anon USING (TRUE);

-- =========================================================================
-- SEED: SEASONS
-- =========================================================================

INSERT INTO seasons (year, is_active) VALUES
  (2024, FALSE),
  (2025, TRUE);
