const PARAMS = {
  symbols: [
    { key: 'XAUUSD', label: 'Gold (XAU/USD)', td: 'XAU/USD' },
    { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)', td: 'BTC/USD' },
    { key: 'SPY', label: 'S&P 500 ETF (SPY)', td: 'SPY' },
    { key: 'XAGUSD', label: 'Silver (XAG/USD)', td: 'XAG/USD' },
  ],
  pairs: [
    { key: 'D_H1', label: 'Daily → H1', htf: '1day', ltf: '1h' },
    { key: 'H4_M15', label: 'H4 → M15', htf: '4h', ltf: '15min' },
    { key: 'H1_M5', label: 'H1 → M5', htf: '1h', ltf: '5min' },
    { key: 'M15_M1', label: 'M15 → M1', htf: '15min', ltf: '1min' },
  ],
  maxWickPct: 0.05,          // HTF "no-wick" key-level candle detection (same rule as the wick strategy)
  fractalStrength: 2,        // LTF liquidity swing detection
  consolidationLookback: 5,  // bars used to build the small order-block zone right after the sweep
  consolidationMaxATR: 1.5,  // that zone's total range must be under this many ATR to count as "tight"
  atrPeriod: 14,
  riskPct: 0.01,
  startBalance: 10000,
  outputsize: 5000,
};

module.exports = { PARAMS };
