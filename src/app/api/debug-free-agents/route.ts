import { getDynastyFreeAgents } from '@/lib/queries/dynasty'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const result = await getDynastyFreeAgents(5)
    return NextResponse.json({
      result,
      counts: {
        QB: result.QB?.length,
        RB: result.RB?.length,
        WR: result.WR?.length,
        TE: result.TE?.length,
      }
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 })
  }
}
