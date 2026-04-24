import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  const { data: rankings, error: rankErr } = await supabase
    .from('dynasty_rankings')
    .select('*')
    .order('rank')
    .limit(10)

  const { data: contracts, error: contractErr } = await supabase
    .from('contracts')
    .select('player_id, status')
    .eq('status', 'active')
    .limit(5)

  const { data: players, error: playerErr } = await supabase
    .from('players')
    .select('yahoo_player_id, name')
    .in('name', ['Saquon Barkley', 'Justin Jefferson', 'Nico Collins'])

  return NextResponse.json({
    rankings_count: rankings?.length,
    rankings_sample: rankings,
    contracts_count: contracts?.length,
    player_lookups: players,
    errors: { rankErr, contractErr, playerErr }
  })
}
