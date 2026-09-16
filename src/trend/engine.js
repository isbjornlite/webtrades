const { ema, atr } = require('../indicators');

function runTrendPullbackEngine(entryBars, trendBars, PARAMS) {
  const n = entryBars.length;
  const closes = entryBars.map((b) => b.close);
  const pbEma = ema(closes, PARAMS.pullbackEma);
  const atrArr = atr(entryBars, PARAMS.atrPeriod);

  const trendCloses = trendBars.map((b) => b.close);
  const trendFast = ema(trendCloses, PARAMS.trendEmaFast);
  const trendSlow = ema(trendCloses, PARAMS.trendEmaSlow);

  // For each entry bar, find the direction implied by the most recent trend-timeframe bar.
  let trendPtr = 0;
  const trendDirAt = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    while (trendPtr + 1 < trendBars.length && trendBars[trendPtr + 1].time <= entryBars[i].time) trendPtr++;
    if (trendFast[trendPtr] != null && trendSlow[trendPtr] != null) {
      if (trendFast[trendPtr] > trendSlow[trendPtr]) trendDirAt[i] = 'long';
      else if (trendFast[trendPtr] < trendSlow[trendPtr]) trendDirAt[i] = 'short';
    }
  }

  let balance = PARAMS.startBalance;
  const closedTrades = [];
  let nextSearchIdx = 0;

  const warmup = Math.max(PARAMS.pullbackEma, PARAMS.atrPeriod) + 1;

  for (let i = warmup; i < n - 1; i++) {
    if (i < nextSearchIdx) continue;
    if (pbEma[i] == null || atrArr[i] == null) continue;
    const dir = trendDirAt[i];
    if (!dir) continue;

    // pullback: this bar's range touches the EMA
    const bar = entryBars[i];
    const touchedEma = bar.low <= pbEma[i] && bar.high >= pbEma[i];
    if (!touchedEma) continue;

    // confirmation: the next bar closes back away from the EMA, in the trend direction
    const confirmBar = entryBars[i + 1];
    const confirmEma = pbEma[i + 1];
    if (confirmEma == null) continue;

    let direction = null;
    if (dir === 'long' && confirmBar.close > confirmEma && confirmBar.close > confirmBar.open) direction = 'long';
    if (dir === 'short' && confirmBar.close < confirmEma && confirmBar.close < confirmBar.open) direction = 'short';
    if (!direction) continue;

    const entryIdx = i + 1;
    const entry = confirmBar.close;
    const entryAtr = atrArr[entryIdx] != null ? atrArr[entryIdx] : atrArr[i];
    const initialSlDist = Math.max(PARAMS.initialSlATR * entryAtr, entry * PARAMS.minSlDistancePct);
    let sl = direction === 'long' ? entry - initialSlDist : entry + initialSlDist;
    const initialSl = sl;
    const riskAmount = balance * PARAMS.riskPct;
    const size = riskAmount / initialSlDist;

    // simulate forward with an ATR trailing stop (no fixed take-profit)
    let exitPrice = null, exitReason = null, exitTime = null, exitIdx = n;
    for (let k = entryIdx + 1; k < n; k++) {
      const b = entryBars[k];
      const curAtr = atrArr[k] != null ? atrArr[k] : entryAtr;
      if (direction === 'long') {
        const candidate = b.close - PARAMS.trailATR * curAtr;
        if (candidate > sl) sl = candidate;
        if (b.low <= sl) { exitPrice = sl; exitReason = 'Trailing stop'; exitTime = b.time; exitIdx = k; break; }
      } else {
        const candidate = b.close + PARAMS.trailATR * curAtr;
        if (candidate < sl) sl = candidate;
        if (b.high >= sl) { exitPrice = sl; exitReason = 'Trailing stop'; exitTime = b.time; exitIdx = k; break; }
      }
    }

    if (exitPrice != null) {
      const pnl = direction === 'long' ? size * (exitPrice - entry) : size * (entry - exitPrice);
      balance += pnl;
      closedTrades.push({
        direction, entryTime: confirmBar.time, entry, initialSl, size, riskAmount,
        exitPrice, exitReason, exitTime, pnl, rMultiple: pnl / riskAmount,
      });
    } else {
      closedTrades.push({
        direction, entryTime: confirmBar.time, entry, initialSl, size, riskAmount,
        exitPrice: null, exitReason: 'Åpen ved slutten av datasettet', exitTime: null, pnl: 0, rMultiple: 0,
      });
    }

    nextSearchIdx = exitIdx + 1;
  }

  return { balance, closedTrades };
}

module.exports = { runTrendPullbackEngine };
