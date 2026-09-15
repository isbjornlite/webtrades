const PARAMS = {
  symbols: [
    { key: 'XAUUSD', label: 'Gold (XAU/USD)', td: 'XAU/USD' },
    { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)', td: 'BTC/USD' },
    { key: 'SPY', label: 'S&P 500 ETF (SPY)', td: 'SPY' },
    { key: 'XAGUSD', label: 'Silver (XAG/USD)', td: 'XAG/USD' },
  ],
  interval: '1min',
  timezone: 'America/New_York',
  orStart: '09:30',
  orEnd: '09:45',    // 15-minute opening range
  // Entry no longer scans for the first breakout bar. Instead we look at the
  // 6th 3-minute candle after 09:45 (built by merging three 1-min bars) —
  // that's the candle spanning 10:00–10:02 — and use its close to decide
  // direction: above the OR high = long, below the OR low = short.
  signalCandleStart: '10:00',
  signalCandleEnd: '10:03',
  rrRatio: 3,        // fixed 3:1 reward:risk
  riskPct: 0.01,
  startBalance: 10000,
  lookbackDays: 30,
  chunkDays: 3,
};

module.exports = { PARAMS };
