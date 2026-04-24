import { NextResponse } from 'next/server';
import { fetchRookies } from '@/lib/sleeper/rookies';

export const revalidate = 86400;

export async function GET() {
  try {
    const rookies = await fetchRookies();
    return NextResponse.json({ rookies });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
