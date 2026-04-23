import { NextResponse } from 'next/server'
import { yahooFetch } from '@/lib/yahoo/client'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const { data: authRow } = await supabase.from('yahoo_auth').select('league_key').single()
  const leagueKey = authRow?.league_key
  const rosterData = await yahooFetch(`/league/${leagueKey}/teams;out=roster`)
  return NextResponse.json({ leagueKey, rosterData })
}
