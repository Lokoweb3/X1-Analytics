import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const pool = searchParams.get('pool')
    const tf = searchParams.get('tf')
    const limit = parseInt(searchParams.get('limit') || '500')

    if (!pool || !tf) {
      return NextResponse.json(
        { error: 'Missing required params: pool, tf' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('candles')
      .select('time_bucket, open_price, high_price, low_price, close_price, volume')
      .eq('pool_address', pool)
      .eq('timeframe', tf)
      .order('time_bucket', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json(
      { error: { message: String(err) } },
      { status: 500 }
    )
  }
}
