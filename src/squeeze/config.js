const PARAMS = {
  symbols: [
    { key: 'XAUUSD', label: 'Gold (XAU/USD)', td: 'XAU/USD' },
    { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)', td: 'BTC/USD' },
    { key: 'SPY', label: 'S&P 500 ETF (SPY)', td: 'SPY' },
    { key: 'XAGUSD', label: 'Silver (XAG/USD)', td: 'XAG/USD' },
  ],
  trendTimeframe: '4h',    // same higher-timeframe trend filter as the Trend Pullback system
  trendEmaFast: 50,
  trendEmaSlow: 200,
  bbPeriod: 20,             // Bollinger Band period
  bbMult: 2,                // Bollinger Band standard-deviation multiplier
  squeezeLookback: 100,     // how many bars back we compare current band-width against
  squeezePercentile: 40,    // width must be in the bottom X% of that lookback window to count as squeezed
  atrPeriod: 14,
  initialSlATR: 1.5,
  trailATR: 2.0,
  minSlDistancePct: 0.003,
  riskPct: 0.01,
  startBalance: 10000,
  outputsize: 5000,
};

const TIMEFRAMES = [
  { key: '15min', label: '15 min', td: '15min' },
  { key: '30min', label: '30 min', td: '30min' },
  { key: '1h', label: '1 time', td: '1h' },
];

module.exports = { PARAMS, TIMEFRAMES };
