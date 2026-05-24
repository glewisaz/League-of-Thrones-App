-- League of Thrones — Ghost franchise flag
-- Migration: 0007
--
-- Adds `is_ghost` to teams so historical owners who no longer have a
-- current franchise can be represented as their own teams row (for
-- attribution of historical W-L/matchups/champion-of-2019 etc.)
-- without polluting the home page league overview or admin team lists.
-- =========================================================================

ALTER TABLE teams ADD COLUMN is_ghost BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX teams_is_ghost_idx ON teams(is_ghost) WHERE is_ghost = TRUE;
