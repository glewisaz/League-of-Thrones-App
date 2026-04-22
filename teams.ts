import { createAnonServerClient } from '@/lib/supabase/server';
import type { ContractWithCosts, Team } from '@/types/database';

/**
 * Server-side query helpers for the public site.
 *
 * Pattern: each function creates its own client and returns plain typed data.
 * Throws on Supabase errors so caller pages can rely on a successful return.
 */

export async function getAllTeams(): Promise<Team[]> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('owner_name');
  if (error) throw error;
  return data ?? [];
}

export async function getTeamBySlug(slug: string): Promise<Team | null> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Returns all active contracts for a team with current/next-year costs
 * already computed. Useful for team detail pages.
 */
export async function getActiveContractsForTeam(
  teamId: string,
): Promise<ContractWithCosts[]> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('contracts_with_costs')
    .select('*')
    .eq('current_team_id', teamId)
    .eq('status', 'active');
  if (error) throw error;
  return (data as ContractWithCosts[]) ?? [];
}
