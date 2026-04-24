import { NextResponse } from 'next/server';
import { getLeagueKey, fetchYahooPlayers } from '@/lib/yahoo/players';

export async function GET() {
  try {
    const leagueKey = await getLeagueKey();
    if (!leagueKey) {
      return NextResponse.json(
        { error: 'league_key not set in yahoo_auth — run Yahoo OAuth connect first' },
        { status: 400 },
      );
    }
    const players = await fetchYahooPlayers(leagueKey, 'FA');
    return NextResponse.json({ players });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
