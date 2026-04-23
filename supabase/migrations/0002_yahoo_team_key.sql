-- Add Yahoo team key to teams so sync-transactions can look up team_id.
-- Run AFTER 0001_initial_schema.sql.
ALTER TABLE teams ADD COLUMN yahoo_team_key TEXT UNIQUE;
CREATE INDEX teams_yahoo_team_key_idx ON teams(yahoo_team_key);
