const PARAMS = {
  symbols: [
    { key: 'XAUUSD', label: 'Gold (XAU/USD)', td: 'XAU/USD' },
    { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)', td: 'BTC/USD' },
    { key: 'SPY', label: 'S&P 500 ETF (SPY)', td: 'SPY' },
    { key: 'XAGUSD', label: 'Silver (XAG/USD)', td: 'XAG/USD' },
  ],
  fractalStrength: 2,          // bars required on each side to confirm a swing high/low
  maxZonePairGapBars: 30,      // max bars between the swing high and swing low that form a zone
  impulseMultiplier: 1.0,      // breakout must travel at least this many zone-heights beyond the zone
  pocBins: 20,                 // number of price bins used to build the volume profile within the zone
  rrRatio: 3,                  // fixed 3:1 reward:risk
  riskPct: 0.01,
  startBalance: 10000,
  outputsize: 5000,
};

const TIMEFRAMES = [
  { key: '15min', label: '15 min', td: '15min' },
  { key: '30min', label: '30 min', td: '30min' },
  { key: '1h', label: '1 time', td: '1h' },
  { key: '4h', label: '4 timer', td: '4h' },
];

module.exports = { PARAMS, TIMEFRAMES };
