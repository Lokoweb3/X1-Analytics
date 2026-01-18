// app/api/indexer/route.js
// X1 XDEX Indexer — safe, chunked, idempotent
// UPDATED: Added swap validation to prevent corrupted data

import { Connection } from '@solana/web3.js';
import { batchProcessSlots } from '../../../lib/xdex-parser.js';
import { createClient } from '@supabase/supabase-js';

/* -------------------- CONFIG -------------------- */

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel hard limit

const DEFAULT_MAX_SLOTS = Number(process.env.INDEXER_MAX_SLOTS || 200);

/* -------------------- CLIENTS -------------------- */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const connection = new Connection('https://rpc.mainnet.x1.xyz', {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60_000,
});

/* -------------------- ROUTE -------------------- */

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    console.log('🚀 XDEX indexer started');

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit')) || DEFAULT_MAX_SLOTS;
    const tail = url.searchParams.get('tail') === '1';

    const currentSlot = await connection.getSlot();

    /* ---------- load indexer state ---------- */

    const { data: state } = await supabase
      .from('indexer_state')
      .select('last_processed_slot')
      .eq('id', 1)
      .maybeSingle();

    let startSlot;
    if (tail) {
      startSlot = Math.max(currentSlot - limit + 1, 0);
    } else {
      startSlot =
        typeof state?.last_processed_slot === 'number'
          ? state.last_processed_slot + 1
          : currentSlot - 60;
    }

    const endSlot = Math.min(currentSlot, startSlot + limit - 1);

    if (startSlot > currentSlot) {
      return Response.json({
        success: true,
        message: 'Already caught up',
        currentSlot,
      });
    }

    console.log(`🔎 Slots ${startSlot} → ${endSlot}`);

    /* ---------- parse swaps ---------- */

    const swaps = await batchProcessSlots(connection, startSlot, endSlot);
    console.log(`💱 Found ${swaps.length} raw swaps`);

    /* ---------- VALIDATION: filter invalid swaps ---------- */

    const validSwaps = swaps.filter(s => {
      // Check 1: Ensure in/out tokens are different
      if (s.tokenInMint === s.tokenOutMint) {
        console.warn(`⚠️  Invalid swap (same token): ${s.signature?.slice(0, 8)}...`);
        return false;
      }
      
      // Check 2: Ensure both tokens exist
      if (!s.tokenInMint || !s.tokenOutMint) {
        console.warn(`⚠️  Invalid swap (missing token): ${s.signature?.slice(0, 8)}...`);
        return false;
      }
      
      // Check 3: Ensure amounts exist
      if (!s.amountIn || !s.amountOut) {
        console.warn(`⚠️  Invalid swap (missing amounts): ${s.signature?.slice(0, 8)}...`);
        return false;
      }

      return true;
    });

    const invalidCount = swaps.length - validSwaps.length;
    if (invalidCount > 0) {
      console.log(`🚫 Filtered ${invalidCount} invalid swaps`);
    }
    console.log(`✅ Valid swaps: ${validSwaps.length}`);

    /* ---------- store swaps ---------- */

    if (validSwaps.length) {
      const { error } = await supabase
        .from('swaps')
        .upsert(
          validSwaps.map(s => ({
            signature: s.signature,
            slot: s.slot,
            block_time: s.blockTime
              ? new Date(s.blockTime * 1000).toISOString()
              : null,
            pool_address: s.poolAddress ?? null,
            token_in_mint: s.tokenInMint ?? null,
            token_out_mint: s.tokenOutMint ?? null,
            amount_in: s.amountIn ?? null,
            amount_out: s.amountOut ?? null,
            price: s.price ?? null,
            user_wallet: s.userWallet ?? null,
            success: s.success ?? true,
          })),
          { onConflict: 'signature' }
        );

      if (error) console.error('❌ swap insert error:', error);
    }

    /* ---------- advance indexer state ---------- */

    await supabase.from('indexer_state').upsert({
      id: 1,
      last_processed_slot: endSlot,
      last_run: new Date().toISOString(),
      total_swaps: validSwaps.length,
    });

    const duration = Date.now() - startedAt;

    return Response.json({
      success: true,
      slotsProcessed: endSlot - startSlot + 1,
      swapsFound: swaps.length,
      validSwaps: validSwaps.length,
      invalidSwaps: invalidCount,
      startSlot,
      endSlot,
      currentSlot,
      duration: `${duration}ms`,
      note:
        endSlot < currentSlot
          ? `Behind by ${currentSlot - endSlot} slots`
          : 'Caught up to head',
    });
  } catch (err) {
    console.error('🔥 Indexer crash:', err);
    return Response.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

/* -------------------- POST (TEST) -------------------- */

export async function POST(request) {
  const body = await request.json();

  if (body.action === 'test') {
    const slot = await connection.getSlot();
    return Response.json({
      ok: true,
      slot,
      rpc: 'https://rpc.mainnet.x1.xyz',
    });
  }

  if (body.action === 'index-now') {
    return GET(request);
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}