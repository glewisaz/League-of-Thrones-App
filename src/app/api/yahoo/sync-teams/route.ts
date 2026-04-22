import { yahooFetch } from '@/lib/yahoo/client'
import { NextResponse } from 'next/server'

export async function GET() {
  const data = await yahooFetch('/users;use_login=1/games;game_keys=nfl/leagues')
  return NextResponse.json(data)
}
