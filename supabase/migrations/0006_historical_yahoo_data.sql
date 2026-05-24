-- League of Thrones — Historical Yahoo data
-- Migration: 0006
--
-- Enables backfilling prior-season data from Yahoo:
--   * team_season_keys — maps each franchise to its yahoo_team_key per season,
--     since Yahoo regenerates team_keys every year (game_key prefix changes).
--   * matchups — per-week head-to-head results for franchise history /
--     head-to-head record book.
--   * historical_rosters — end-of-season roster snapshots per team/season.
--   * Seeds prior seasons (2018–2023).
-- =========================================================================

-- Per-franchise mapping of historical yahoo_team_keys.
-- The teams.yahoo_team_key column still holds the CURRENT season's key
-- (used by sync-transactions for real-time mapping); this table covers
-- every other season the franchise has played.
CREATE TABLE team_season_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season           INT  NOT NULL REFERENCES seasons(year),
  yahoo_team_key   TEXT NOT NULL,
  yahoo_league_key TEXT NOT NULL,
  -- Snapshot of how the team appeared that season — useful when an owner
  -- renamed their team year over year and we want to show the period name.
  yahoo_team_name  TEXT,
  yahoo_manager    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, season),
  UNIQUE (yahoo_team_key)
);

CREATE INDEX team_season_keys_season_idx ON team_season_keys(season);
CREATE INDEX team_season_keys_league_idx ON team_season_keys(yahoo_league_key);

-- Per-season league_key registry. Lets the admin pick which league_id to
-- sync for each year without re-discovering every time.
CREATE TABLE season_leagues (
  season           INT  PRIMARY KEY REFERENCES seasons(year),
  yahoo_league_key TEXT NOT NULL,
  league_name      TEXT,
  num_teams        INT,
  start_week       INT,
  end_week         INT,
  playoff_start_week INT,
  is_finished      BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at   TIMESTAMPTZ
);

-- Per-week head-to-head matchup results.
-- One row per matchup (not two — we put both teams on the same row).
-- Use the helper view "matchups_by_team" below for per-team queries.
CREATE TABLE matchups (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season           INT  NOT NULL REFERENCES seasons(year),
  week             INT  NOT NULL CHECK (week BETWEEN 1 AND 20),
  -- Lower team_id always goes in "team_a" so we get a canonical order and
  -- can build a stable UNIQUE constraint without thinking about home/away.
  team_a_id        UUID NOT NULL REFERENCES teams(id),
  team_b_id        UUID NOT NULL REFERENCES teams(id),
  team_a_points    NUMERIC(10,2) NOT NULL,
  team_b_points    NUMERIC(10,2) NOT NULL,
  -- winner_team_id NULL means tie (Yahoo allows ties when scores are equal
  -- and the league doesn't have a tiebreaker rule enabled).
  winner_team_id   UUID REFERENCES teams(id),
  is_playoffs      BOOLEAN NOT NULL DEFAULT FALSE,
  is_consolation   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Yahoo's "matchup_id" inside a week — lets us dedupe on re-sync without
  -- having to look at team_ids.
  yahoo_matchup_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (team_a_id < team_b_id),
  UNIQUE (season, week, team_a_id, team_b_id)
);

CREATE INDEX matchups_season_week_idx ON matchups(season, week);
CREATE INDEX matchups_team_a_idx      ON matchups(team_a_id);
CREATE INDEX matchups_team_b_idx      ON matchups(team_b_id);

-- View that unrolls matchups into one row per (team, opponent) pair, so a
-- per-team query is a simple WHERE team_id = ?. Each matchup row becomes
-- two rows in this view.
CREATE VIEW matchups_by_team AS
SELECT
  m.id              AS matchup_id,
  m.season,
  m.week,
  m.team_a_id       AS team_id,
  m.team_b_id       AS opponent_id,
  m.team_a_points   AS points_for,
  m.team_b_points   AS points_against,
  m.team_a_points - m.team_b_points AS margin,
  CASE
    WHEN m.winner_team_id = m.team_a_id THEN 'W'
    WHEN m.winner_team_id = m.team_b_id THEN 'L'
    ELSE 'T'
  END               AS result,
  m.is_playoffs,
  m.is_consolation
FROM matchups m
UNION ALL
SELECT
  m.id,
  m.season,
  m.week,
  m.team_b_id,
  m.team_a_id,
  m.team_b_points,
  m.team_a_points,
  m.team_b_points - m.team_a_points,
  CASE
    WHEN m.winner_team_id = m.team_b_id THEN 'W'
    WHEN m.winner_team_id = m.team_a_id THEN 'L'
    ELSE 'T'
  END,
  m.is_playoffs,
  m.is_consolation
FROM matchups m;

-- End-of-season roster snapshots. We only store the final-week roster
-- (regular season week 14 or so), not every week — that's enough for the
-- "who was on your team in 2020?" question without exploding row counts.
CREATE TABLE historical_rosters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season          INT  NOT NULL REFERENCES seasons(year),
  team_id         UUID NOT NULL REFERENCES teams(id),
  -- Player may or may not be in our players table — if Yahoo had a player
  -- we never imported (e.g. retired before 2025), we still capture the name.
  yahoo_player_id TEXT REFERENCES players(yahoo_player_id),
  player_name     TEXT NOT NULL,
  position        TEXT,
  selected_position TEXT,         -- WR/BN/IR — slot the player was in
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season, team_id, player_name)
);

CREATE INDEX historical_rosters_season_team_idx ON historical_rosters(season, team_id);

-- Add a "yahoo_status" column to standings to capture playoff bracket outcome
-- as Yahoo reported it (e.g. "Lost in Semifinals"). Existing standings rows
-- get NULL by default — fine.
ALTER TABLE standings ADD COLUMN yahoo_outcome TEXT;

-- =========================================================================
-- RLS — public reads, service-role writes (same pattern as 0001)
-- =========================================================================

ALTER TABLE team_season_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_leagues      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_rosters  ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_read_team_season_keys   ON team_season_keys   FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_season_leagues     ON season_leagues     FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_matchups           ON matchups           FOR SELECT TO anon USING (TRUE);
CREATE POLICY anon_read_historical_rosters ON historical_rosters FOR SELECT TO anon USING (TRUE);

-- =========================================================================
-- SEED: prior seasons (idempotent — ON CONFLICT DO NOTHING)
-- =========================================================================

INSERT INTO seasons (year, is_active) VALUES
  (2018, FALSE),
  (2019, FALSE),
  (2020, FALSE),
  (2021, FALSE),
  (2022, FALSE),
  (2023, FALSE)
ON CONFLICT (year) DO NOTHING;
