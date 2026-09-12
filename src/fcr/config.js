const PARAMS = {
  symbols: [
    { key: 'XAUUSD', label: 'Gold (XAU/USD)', td: 'XAU/USD' },
    { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)', td: 'BTC/USD' },
    { key: 'SPY', label: 'S&P 500 ETF (SPY)', td: 'SPY' },
    { key: 'XAGUSD', label: 'Silver (XAG/USD)', td: 'XAG/USD' },
  ],
  interval: '1min',
  timezone: 'America/New_York',
  fcrStart: '09:30',   // start of the First Candle Range (5-min opening candle)
  fcrEnd: '09:35',
  cutoffTime: '10:00', // if the full setup (breakout + reversal sweep + engulfing) hasn't
                        // completed by this time, skip the day entirely
  rrRatio: 3,           // fixed 3:1 reward:risk
  riskPct: 0.01,
  startBalance: 10000,
  lookbackDays: 30,     // how many calendar days of 1-min history to fetch
  chunkDays: 3,         // Twelve Data free tier caps at 5000 bars/call; 3 days of 1-min bars fits safely
};

module.exports = { PARAMS };
