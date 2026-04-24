import { yahooFetch } from '@/lib/yahoo/client';
import { NextResponse } from 'next/server';

export async function GET() {
  const data = await yahooFetch('/game/nfl/players;sort=AR;count=15;search=rookie');
  return NextResponse.json(data);
}
