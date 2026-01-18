/**
 * XDEX swap detection & parsing utilities (FIXED)
 * Network: X1 (Solana fork)
 *
 * FIXES:
 *  1. Corrected swap direction (tokenIn = spent, tokenOut = received)
 *  2. Removed redundant getTransaction calls
 *  3. Better variable naming for clarity
 */

export const XDEX_PROGRAM_ID =
  'sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN';

export const TOKEN_PROGRAM_LEGACY =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export const TOKEN_PROGRAM_2022 =
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/**
 * Detect XDEX swap by log inspection
 */
export function isXDEXSwapByLogs(tx) {
  const logs = tx?.meta?.logMessages;
  if (!Array.isArray(logs)) return false;

  return logs.some(l => l.startsWith(`Program ${XDEX_PROGRAM_ID} invoke`));
}

/**
 * Compatibility alias
 */
export function isXDEXSwap(tx) {
  return isXDEXSwapByLogs(tx);
}

/**
 * Extract token balance deltas from a transaction
 */
export function extractTokenDeltas(tx) {
  const pre = tx?.meta?.preTokenBalances ?? [];
  const post = tx?.meta?.postTokenBalances ?? [];

  const preMap = new Map();
  const postMap = new Map();

  for (const b of pre) preMap.set(b.accountIndex, b);
  for (const b of post) postMap.set(b.accountIndex, b);

  const deltas = [];

  // post balances
  for (const [accountIndex, postBal] of postMap.entries()) {
    const preBal = preMap.get(accountIndex);

    const postAmt = BigInt(postBal.uiTokenAmount?.amount ?? '0');
    const preAmt = BigInt(preBal?.uiTokenAmount?.amount ?? '0');
    const delta = postAmt - preAmt;

    if (delta !== 0n) {
      deltas.push({
        accountIndex,
        mint: postBal.mint,
        owner: postBal.owner,
        programId: postBal.programId,
        decimals:
          postBal.uiTokenAmount?.decimals ??
          preBal?.uiTokenAmount?.decimals ??
          null,
        delta, // signed base units
      });
    }
  }

  // accounts removed in post
  for (const [accountIndex, preBal] of preMap.entries()) {
    if (postMap.has(accountIndex)) continue;

    const preAmt = BigInt(preBal.uiTokenAmount?.amount ?? '0');
    if (preAmt !== 0n) {
      deltas.push({
        accountIndex,
        mint: preBal.mint,
        owner: preBal.owner,
        programId: preBal.programId,
        decimals: preBal.uiTokenAmount?.decimals ?? null,
        delta: -preAmt,
      });
    }
  }

  return deltas;
}

/**
 * Heuristically choose swap in/out legs
 * FIXED: Correct naming convention
 *  - tokenInLeg (negative delta) = tokens SPENT by user
 *  - tokenOutLeg (positive delta) = tokens RECEIVED by user
 */
export function pickSwapLegs(deltas) {
  if (!Array.isArray(deltas) || deltas.length === 0) {
    return { tokenInLeg: null, tokenOutLeg: null };
  }

  const sorted = [...deltas].sort((a, b) => {
    const aa = a.delta < 0n ? -a.delta : a.delta;
    const bb = b.delta < 0n ? -b.delta : b.delta;
    // FIXED: Correct descending order (largest absolute value first)
    return aa > bb ? -1 : aa < bb ? 1 : 0;
  });

  // FIXED: tokenIn = spent (negative), tokenOut = received (positive)
  const tokenInLeg = sorted.find(d => d.delta < 0n) || null;   // spent
  const tokenOutLeg = sorted.find(d => d.delta > 0n) || null;  // received

  return { tokenInLeg, tokenOutLeg };
}

/**
 * Parse tx into a swap record
 * FIXED: Correct field mapping
 */
export function parseXDEXSwap(tx) {
  if (!isXDEXSwapByLogs(tx)) return null;

  const deltas = extractTokenDeltas(tx);
  const { tokenInLeg, tokenOutLeg } = pickSwapLegs(deltas);

  const success = tx?.meta?.err == null;

  // FIXED: tokenIn = spent (negative), tokenOut = received (positive)
  return {
    signature: tx.transaction?.signatures?.[0] ?? null,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    success,

    tokenInMint: tokenInLeg?.mint ?? null,
    tokenInAmount: tokenInLeg ? tokenInLeg.delta.toString() : null, // negative string

    tokenOutMint: tokenOutLeg?.mint ?? null,
    tokenOutAmount: tokenOutLeg ? tokenOutLeg.delta.toString() : null, // positive string

    deltas, // raw (optional)
  };
}

/**
 * Batch process slots - OPTIMIZED
 * FIXED: Removed redundant getTransaction calls
 */
export async function batchProcessSlots(connection, startSlot, endSlot) {
  const swaps = [];

  for (let slot = startSlot; slot <= endSlot; slot++) {
    let block;
    try {
      block = await connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
        rewards: false,
      });
    } catch {
      continue;
    }
    if (!block?.transactions?.length) continue;

    // FIXED: Process transactions directly from block (no redundant RPC calls)
    for (const tx of block.transactions) {
      const logs = tx?.meta?.logMessages || [];
      
      // Skip non-XDEX transactions
      if (!Array.isArray(logs) || !logs.some(l => l.startsWith(`Program ${XDEX_PROGRAM_ID} invoke`))) {
        continue;
      }

      const parsed = parseXDEXSwap(tx);
      if (!parsed) continue;

      // Convert to positive strings for database storage
      const amountIn = parsed.tokenInAmount
        ? (BigInt(parsed.tokenInAmount) < 0n ? (-BigInt(parsed.tokenInAmount)).toString() : parsed.tokenInAmount)
        : null;

      const amountOut = parsed.tokenOutAmount
        ? (BigInt(parsed.tokenOutAmount) < 0n ? (-BigInt(parsed.tokenOutAmount)).toString() : parsed.tokenOutAmount)
        : null;

      swaps.push({
        signature: parsed.signature,
        slot: parsed.slot,
        blockTime: parsed.blockTime,

        // Placeholder fields for future enrichment
        poolAddress: null,
        price: null,
        userWallet: null,

        tokenInMint: parsed.tokenInMint,
        tokenOutMint: parsed.tokenOutMint,
        amountIn,
        amountOut,
        success: parsed.success,
      });
    }
  }

  return swaps;
}