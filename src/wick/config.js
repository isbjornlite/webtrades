const PARAMS = {
  symbol: 'XAU/USD',
  maxWickPct: 0.05,       // a wick must be <= 5% of the candle's total range to count as "no wick"
  atrPeriod: 14,
  slATR: 1.5,             // stop loss = slATR x ATR from the tapped line
  // Take profit is dynamic, not ATR-based: it targets the next opposite-type
  // liquidity line that forms AFTER entry. A long trade's TP is the first
  // future resistance line (bearish no-wick candle); a short's TP is the
  // first future support line (bullish no-wick candle). If none ever forms,
  // the trade stays open until stop loss or the end of the data.
  minSlDistancePct: 0.003, // safety floor, same as the DXY/Gold system
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
