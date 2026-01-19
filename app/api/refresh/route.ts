import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json()

  if (body.secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pool, timeframe, lookbackHours = 24 } = body

  const { data, error } = await supabaseAdmin.rpc('refresh_candles', {
    p_pool_address: pool,
    p_timeframe: timeframe,
    p_lookback: `${lookbackHours} hours`
  })

  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, upserted: data })
}
