import { createAnonServerClient } from '@/lib/supabase/server';
import { contractCostAtYear, nextYearCost, isExpiring } from '@/lib/contracts';
import type { Team, DraftPick } from '@/types/database';

export type { Team, DraftPick };

export interface RosterEntry {
  id: string;
  player_name: string;
  position: string | null;
  year_one_price: number;
  contract_year: number;
  current_year_cost: number;
  next_year_cost: number | null;
  is_expiring: boolean;
}

interface ContractRow {
  id: string;
  year_one_price: number;
  contract_year: number;
  players: { name: string; position: string | null; nfl_team: string | null } | null;
  unmatched_players: { raw_name: string; position: string | null } | null;
}

export async function getAllTeams(): Promise<Team[]> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('owner_name');
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function getTeamBySlug(slug: string): Promise<Team | null> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as Team | null;
}

export async function getTeamRoster(teamId: string): Promise<RosterEntry[]> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('contracts')
    .select('id, year_one_price, contract_year, players(name, position, nfl_team), unmatched_players(raw_name, position)')
    .eq('current_team_id', teamId)
    .eq('status', 'active');
  if (error) throw error;

  return ((data ?? []) as unknown as ContractRow[]).map((row) => ({
    id: row.id,
    player_name: row.players?.name ?? row.unmatched_players?.raw_name ?? 'Unknown',
    position: row.players?.position ?? row.unmatched_players?.position ?? null,
    year_one_price: row.year_one_price,
    contract_year: row.contract_year,
    current_year_cost: contractCostAtYear(row.year_one_price, row.contract_year) ?? 0,
    next_year_cost: nextYearCost(row.year_one_price, row.contract_year),
    is_expiring: isExpiring(row.contract_year),
  }));
}

export async function getDraftPicksForTeam(teamId: string): Promise<DraftPick[]> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('draft_picks')
    .select('*')
    .eq('current_team_id', teamId)
    .eq('is_used', false)
    .order('season');
  if (error) throw error;
  return (data ?? []) as DraftPick[];
}

export async function getAllCapByTeam(): Promise<Record<string, number>> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('contracts')
    .select('current_team_id, year_one_price, contract_year')
    .eq('status', 'active');
  if (error) throw error;

  const caps: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ current_team_id: string; year_one_price: number; contract_year: number }>) {
    const cost = contractCostAtYear(row.year_one_price, row.contract_year) ?? 0;
    caps[row.current_team_id] = (caps[row.current_team_id] ?? 0) + cost;
  }
  return caps;
}

export async function getActiveAuctionCap(): Promise<number> {
  const supabase = createAnonServerClient();
  const { data } = await supabase
    .from('seasons')
    .select('auction_cap')
    .eq('is_active', true)
    .maybeSingle();
  return (data as { auction_cap: number } | null)?.auction_cap ?? 200;
}
