/**
 * Hand-written TypeScript types matching the schema in
 * supabase/migrations/0001_initial_schema.sql.
 *
 * To regenerate from the live DB once you've run `supabase login`:
 *
 *   npx supabase gen types typescript \
 *     --project-id lksaeurrnsqiscbbhxxl \
 *     > src/types/database.ts
 */

// ---------- Enums ----------

export type Conference =
  | 'north'
  | 'south';

export type AcquisitionType =
  | 'auction'
  | 'rookie_draft'
  | 'waiver'
  | 'free_agent'
  | 'trade_inherited';

export type ContractStatus =
  | 'active'
  | 'expired'
  | 'dropped'
  | 'traded_away';

export type PickType = 'rookie' | 'supplemental';

export type TradeStatus = 'completed' | 'voided';

export type TradeAssetType = 'contract' | 'draft_pick' | 'faab';

export type Bracket = 'playoffs' | 'consolation';

export type TransactionTypeEnum = 'add' | 'drop' | 'trade' | 'commish';

export type SyncStatus = 'success' | 'partial' | 'failed';

// ---------- Row types ----------

export interface Season {
  year: number;
  auction_cap: number;
  faab_cap: number;
  is_active: boolean;
}

export interface Team {
  id: string;
  name: string | null;
  owner_name: string;
  conference: Conference | null;
  slug: string;
  logo_url: string | null;
  created_at: string;
}

export interface Player {
  yahoo_player_id: string;
  name: string;
  position: string | null;
  nfl_team: string | null;
  updated_at: string;
}

export interface UnmatchedPlayer {
  id: string;
  raw_name: string;
  position: string | null;
  source: string;
  resolved_player_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  player_id: string | null;
  unmatched_player_id: string | null;
  current_team_id: string;
  original_team_id: string | null;
  acquisition_season: number;
  acquisition_type: AcquisitionType;
  year_one_price: number;
  contract_year: number;
  status: ContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** The contracts_with_costs view: contract row + computed cost columns. */
export interface ContractWithCosts extends Contract {
  current_year_cost: number | null;
  next_year_cost: number | null;
  is_expiring: boolean;
}

export interface DraftPick {
  id: string;
  season: number;
  round: number;
  pick_number: number | null;
  original_team_id: string;
  current_team_id: string;
  pick_type: PickType;
  is_used: boolean;
  used_on_player_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Trade {
  id: string;
  trade_date: string;
  season: number;
  notes: string | null;
  status: TradeStatus;
  created_at: string;
}

export interface TradeAsset {
  id: string;
  trade_id: string;
  from_team_id: string;
  to_team_id: string;
  asset_type: TradeAssetType;
  contract_id: string | null;
  draft_pick_id: string | null;
  faab_amount: number | null;
}

export interface Standings {
  id: string;
  season: number;
  team_id: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  seed: number | null;
  bracket: Bracket | null;
  final_placement: number | null;
}

export interface Champion {
  season: number;
  champion_team_id: string;
  runner_up_team_id: string | null;
  north_crown_team_id: string | null;
  south_crown_team_id: string | null;
  notes: string | null;
}

export interface Transaction {
  id: string;
  yahoo_transaction_id: string | null;
  season: number;
  week: number | null;
  team_id: string | null;
  transaction_type: TransactionTypeEnum;
  player_id: string | null;
  faab_spent: number | null;
  raw_payload: unknown;
  created_at: string;
}
