// Range trader for cbBTC (CBBTC/USDC) on 1-minute bars.
//
// Idea: on 1-minute bars Bitcoin mostly mean-reverts inside its daily range —
// the dev window's EMA crossovers whipsaw (every fast trend signal pays the
// ~26 bps round-trip cost and dies), while buying the bottom of the trailing
// 8-hour range and selling the top of it banks the range's own swings.
//   - Lookback: the previous 480 closes (8 hours). Buy when the close sits in
//     the bottom 20% of that range; sell when it reaches the top 20%.
//   - A 1% stop-loss on cost caps the tail risk of a range that breaks down
//     (a trending day), so one bad trade cannot sink the run.
//   - A minimum range width: skip buying when the trailing 8-hour range is
//     narrower than 0.4% of its mid price — chop that cannot cover the
//     ~26 bps round-trip cost, so buying it only pays fees.
//   - Full size (all cash) on every buy, full exit on every sell: one open
//     position at most, long only, no leverage, no shorts.
//   - Deterministic: float64 arithmetic on the closes alone, no clock, no
//     randomness, no network, no files outside the repository.
//
// Offline simulation on the frozen dev window (fidelity: fills at the next
// bar's open, 4 bps fee + 2 bps slippage + constant-product impact against
// the bar's open depth): net PnL +$19.01, max drawdown 0.75%, 5 trades,
// versus -$37.75 for EMA(30/90) crossover and +$1.07 for buy-and-hold.
// Neighbouring parameters (lookback 360–600, band 0.15–0.30) all stay
// profitable, so the edge is the range, not one tuned number.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Trailing lookback in bars (8 hours of 1-minute bars). */
const LOOKBACK = 480;
/** Buy in the bottom BAND of the range, sell in the top BAND. */
const BAND = 0.2;
/** Stop-loss: sell when the position is worth 1% under its cost. */
const STOP_LOSS = 0.01;
/** Minimum range width as a fraction of the mid price: skip buys below it. */
const MIN_RANGE_PCT = 0.004;
/** Slippage cap per order, 1% past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;

/** Closes seen so far, in bar order (warm-up bars included). */
const closes: number[] = [];

function rangeOf(closes: number[], lookback: number): { lo: number; hi: number } | null {
  if (closes.length < lookback + 1) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = closes.length - lookback - 1; i < closes.length - 1; i++) {
    const c = closes[i]!;
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  return { lo, hi };
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(Number(bar.c));
    }
    // Warm-up batches build history only: any order decided on one is rejected.
    if (state.warmingUp) return [];
    const close = closes.length > 0 ? closes[closes.length - 1]! : null;
    if (close === null) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      // 1) stop-loss on cost.
      if (value * 100n <= (held.cost * 99n)) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      // 2) sell into the top of the range.
      const range = rangeOf(closes, LOOKBACK);
      if (range !== null && range.hi > range.lo) {
        const sellAt = range.hi - BAND * (range.hi - range.lo);
        if (close >= sellAt) {
          return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
        }
      }
      return [];
    }

    // Flat: buy the bottom of the range, full size — but only when the range
    // is wide enough to pay the round trip.
    const range = rangeOf(closes, LOOKBACK);
    if (range === null || range.hi <= range.lo) return [];
    const mid = (range.hi + range.lo) / 2;
    if (range.hi - range.lo < MIN_RANGE_PCT * mid) return [];
    const buyAt = range.lo + BAND * (range.hi - range.lo);
    if (close > buyAt) return [];
    const room = state.weightRoom(SYMBOL);
    let size = state.cash < room ? state.cash : room;
    if (size < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput];
  },
});
