-- Add direct current-season cost column to contracts.
-- Allows the commissioner to store the exact 2025 cost without re-deriving it
-- from year_one_price each time. Nullable so existing rows fall back to the
-- computed contractCostAtYear() value until manually filled in.
ALTER TABLE contracts ADD COLUMN current_season_cost numeric;
