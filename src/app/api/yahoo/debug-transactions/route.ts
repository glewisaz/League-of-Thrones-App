import { yahooFetch } from '@/lib/yahoo/client'
import { NextResponse } from 'next/server'

export async function GET() {
  const data = await yahooFetch('/league/461.l.708208/transactions;types=add,drop,trade;count=25;start=0')
  return NextResponse.json(data)
}
