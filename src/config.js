const PARAMS = {
  impulseBars: 10,
  minDxyImpulseATR: 2.0,
  maxGoldMoveATR: 0.75,
  dxyRetracement: 0.5,
  maxSetupAgeBars: 30,
  emaFast: 20,
  emaSlow: 50,
  rsiPeriod: 14,
  atrPeriod: 14,
  minConfirmations: 2,
  riskPct: 0.01,
  slATR: 2.0,
  minSlDistancePct: 0.003, // safety floor: SL can never be closer than 0.3% of price, even if ATR is unusually low
  dxyReversalExitPct: 0.003,
  startBalance: 10000,
  outputsize: 150,
};

const TIMEFRAMES = [
  { key: '15min', label: '15 min', td: '15min' },
  { key: '30min', label: '30 min', td: '30min' },
  { key: '1h', label: '1 time', td: '1h' },
  { key: '4h', label: '4 timer', td: '4h' },
];

const FOREX_LEGS = ['EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/CAD', 'USD/SEK', 'USD/CHF'];
const GOLD_SYMBOL = 'XAU/USD';
const ALL_SYMBOLS = [...FOREX_LEGS, GOLD_SYMBOL];

module.exports = { PARAMS, TIMEFRAMES, FOREX_LEGS, GOLD_SYMBOL, ALL_SYMBOLS };
