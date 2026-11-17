# BTC Range Trader

[![make.fun](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Andd291/btc-race-24h-01/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Andd291/btc-race-24h-01/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)

A trading bot for the make.fun bounty [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261117-0603). It trades Coinbase Wrapped BTC (cbBTC) against USDC, one-minute bar at a time, in the `agent-fun/bars-replay/v1` protocol.

## Strategy

Bitcoin on 1-minute bars mostly mean-reverts inside its daily range: fast trend
signals whipsaw and each round trip pays ~26 bps in fees, slippage and price
impact. So this bot trades the range itself:

- **Buy** when the close sits in the bottom 20% of the trailing 8-hour
  (480-bar) range, full size.
- **Sell** when the close reaches the top 20% of that range.
- **Stop-loss** at 1% under cost, so a range that breaks down cannot sink
  the run.
- Long only, at most one open position, no leverage, no shorts.

## Results (dev window, local grade)

Offline simulation on the frozen dev window: net PnL **+$19.01**, max
drawdown **0.75%**, 5 trades — versus −$37.75 for an EMA(30/90) crossover
and +$1.07 for buy-and-hold on the same window.

## Run

```sh
node main.ts
```

It speaks newline-delimited JSON on stdin/stdout (`hello`, one `batch` per
bar, one `reply` per batch). Standard library only, plus the vendored SDK
shim in `vendor/`; deterministic — no clock, no randomness, no network.

## License

MIT — see [LICENSE](LICENSE).
