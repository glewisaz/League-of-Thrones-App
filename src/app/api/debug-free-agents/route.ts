import { createAnonServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAnonServerClient()

  const [{ data: rankings }, { data: rosteredContracts }] = await Promise.all([
    supabase.from('dynasty_rankings').select('rank, player_name, position').order('rank'),
    supabase.from('contracts').select('player_id, players!inner(name)').eq('status', 'active').not('player_id', 'is', null),
  ])

  const rosteredNames = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rosteredContracts ?? []).map((c: any) => c.players?.name?.toLowerCase()).filter(Boolean)
  )

  const rookieResp = await fetch('https://api.sleeper.app/v1/players/nfl')
  const allPlayers = await rookieResp.json()
  const rookieNames = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.values(allPlayers as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.active && p.years_exp === 0 && p.team)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => `${p.first_name} ${p.last_name}`.toLowerCase())
  )

  const rostered = (rankings ?? []).filter(r => rosteredNames.has(r.player_name.toLowerCase()))
  const rookies = (rankings ?? []).filter(r => rookieNames.has(r.player_name.toLowerCase()))
  const unrostered = (rankings ?? []).filter(r =>
    !rosteredNames.has(r.player_name.toLowerCase()) &&
    !rookieNames.has(r.player_name.toLowerCase())
  )

  return NextResponse.json({
    total_rankings: rankings?.length,
    total_rostered_names: rosteredNames.size,
    total_rookie_names: rookieNames.size,
    rostered_rankings: rostered.length,
    rookie_rankings: rookies.length,
    unrostered_remaining: unrostered.length,
    rostered_sample: rostered.slice(0, 5).map(r => r.player_name),
    rookie_sample: rookies.slice(0, 5).map(r => r.player_name),
    unrostered_sample: unrostered.slice(0, 10).map(r => ({ name: r.player_name, pos: r.position })),
  })
}
