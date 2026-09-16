const PARAMS = {
  symbols: [
    { key: 'XAUUSD', label: 'Gold (XAU/USD)', td: 'XAU/USD' },
    { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)', td: 'BTC/USD' },
    { key: 'SPY', label: 'S&P 500 ETF (SPY)', td: 'SPY' },
    { key: 'XAGUSD', label: 'Silver (XAG/USD)', td: 'XAG/USD' },
  ],
  trendTimeframe: '4h',   // higher timeframe used for the trend filter
  trendEmaFast: 50,
  trendEmaSlow: 200,      // fast > slow = long-only regime, fast < slow = short-only regime
  pullbackEma: 20,        // EMA on the entry timeframe that price must pull back to
  atrPeriod: 14,
  initialSlATR: 1.5,      // initial stop distance
  trailATR: 2.0,          // trailing stop distance once price moves favorably
  minSlDistancePct: 0.003,
  riskPct: 0.01,
  startBalance: 10000,
  outputsize: 5000,
};

const TIMEFRAMES = [
  { key: '15min', label: '15 min', td: '15min' },
  { key: '30min', label: '30 min', td: '30min' },
  { key: '1h', label: '1 hour', td: '1h' },
];

module.exports = { PARAMS, TIMEFRAMES };
