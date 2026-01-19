export type TF = '1m' | '5m' | '1h';

export const TIMEFRAMES: Record<TF, { refreshMs: number; lookbackHours: number }> = {
  '1m': { refreshMs: 30_000, lookbackHours: 6 },
  '5m': { refreshMs: 60_000, lookbackHours: 48 },
  '1h': { refreshMs: 60_000, lookbackHours: 24 * 14 }, // 14 days
};
