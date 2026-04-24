CREATE TABLE feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  label       text NOT NULL,
  description text,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- anon can read flags (public pages may gate on them)
CREATE POLICY anon_read_feature_flags
  ON feature_flags FOR SELECT TO anon USING (TRUE);

INSERT INTO feature_flags (key, enabled, label, description) VALUES
  ('auto_create_contracts_on_sync', false, 'Auto-Create Contracts from Yahoo Activity',
   'When turned ON, any time someone adds a player in Yahoo, the site will automatically create a contract record for that player. This is useful during the season when you want waiver pickups and free agent adds to appear on team pages automatically.

Keep this OFF during the offseason — otherwise any pre-auction roster cleanup in Yahoo would create wrong contract data. Turn it ON the day after the auction draft ends, once all auction contracts are manually entered.'),

  ('enable_nightly_sync', true, 'Nightly Auto-Sync',
   'When turned ON, the site automatically pulls the latest transactions, rosters, and standings from Yahoo every night at 3am. This keeps The Raven feed and team pages up to date without anyone having to do anything.

Keep this ON year-round. The only reason to turn it OFF would be if Yahoo is returning bad data or the sync is causing errors.');
