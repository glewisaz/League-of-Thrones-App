CREATE TABLE dynasty_rankings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank          int NOT NULL,
  player_name   text NOT NULL,
  position      text NOT NULL,
  yahoo_player_id text,
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX ON dynasty_rankings (position, rank);

ALTER TABLE dynasty_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_read_dynasty_rankings
  ON dynasty_rankings FOR SELECT TO anon USING (TRUE);
