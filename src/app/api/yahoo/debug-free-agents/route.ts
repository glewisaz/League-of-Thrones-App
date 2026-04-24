import { yahooFetch } from '@/lib/yahoo/client';
import { NextResponse } from 'next/server';

export async function GET() {
  const data = await yahooFetch('/league/461.l.708208/players;sort=AR;count=15');
  return NextResponse.json(data);
}
