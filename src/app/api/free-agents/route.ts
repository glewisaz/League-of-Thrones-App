import { NextResponse } from 'next/server';
import { getDynastyFreeAgents } from '@/lib/queries/dynasty';

export const revalidate = 300;

export async function GET() {
  try {
    const freeAgents = await getDynastyFreeAgents(5);
    return NextResponse.json({ freeAgents });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
