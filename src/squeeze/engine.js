const { ema, atr } = require('../indicators');

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function stddev(values, period, smaArr) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    if (smaArr[i] == null) continue;
    let sq = 0;
    for (let k = i - period + 1; k <= i; k++) {
      const d = values[k] - smaArr[i];
      sq += d * d;
    }
    out[i] = Math.sqrt(sq / period);
  }
  return out;
}

function runSqueezeEngine(entryBars, trendBars, PARAMS) {
  const n = entryBars.length;
  const closes = entryBars.map((b) => b.close);
  const smaArr = sma(closes, PARAMS.bbPeriod);
  const stdArr = stddev(closes, PARAMS.bbPeriod, smaArr);
  const atrArr = atr(entryBars, PARAMS.atrPeriod);

  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  const width = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (smaArr[i] != null && stdArr[i] != null && smaArr[i] !== 0) {
      upper[i] = smaArr[i] + PARAMS.bbMult * stdArr[i];
      lower[i] = smaArr[i] - PARAMS.bbMult * stdArr[i];
      width[i] = (upper[i] - lower[i]) / smaArr[i];
    }
  }

  const trendCloses = trendBars.map((b) => b.close);
  const trendFast = ema(trendCloses, PARAMS.trendEmaFast);
  const trendSlow = ema(trendCloses, PARAMS.trendEmaSlow);
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
  const warmup = Math.max(PARAMS.bbPeriod, PARAMS.atrPeriod, PARAMS.squeezeLookback) + 1;

  for (let i = warmup; i < n - 1; i++) {
    if (i < nextSearchIdx) continue;
    if (width[i] == null || atrArr[i] == null) continue;
    const dir = trendDirAt[i];
    if (!dir) continue;

    // is the band currently squeezed (bottom percentile of the lookback window)?
    const windowStart = i - PARAMS.squeezeLookback;
    const windowWidths = [];
    for (let k = windowStart; k < i; k++) { if (width[k] != null) windowWidths.push(width[k]); }
    if (windowWidths.length < PARAMS.squeezeLookback * 0.5) continue;
    windowWidths.sort((a, b) => a - b);
    const percentileIdx = Math.floor(windowWidths.length * PARAMS.squeezePercentile / 100);
    const threshold = windowWidths[percentileIdx];
    if (width[i] > threshold) continue;

    // breakout: the next bar closes outside the band, in the trend direction
    const nextBar = entryBars[i + 1];
    let direction = null;
    if (dir === 'long' && nextBar.close > upper[i]) direction = 'long';
    if (dir === 'short' && nextBar.close < lower[i]) direction = 'short';
    if (!direction) continue;

    const entryIdx = i + 1;
    const entry = nextBar.close;
    const entryAtr = atrArr[entryIdx] != null ? atrArr[entryIdx] : atrArr[i];
    const initialSlDist = Math.max(PARAMS.initialSlATR * entryAtr, entry * PARAMS.minSlDistancePct);
    let sl = direction === 'long' ? entry - initialSlDist : entry + initialSlDist;
    const initialSl = sl;
    const riskAmount = balance * PARAMS.riskPct;
    const size = riskAmount / initialSlDist;

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
        direction, entryTime: nextBar.time, entry, initialSl, size, riskAmount,
        exitPrice, exitReason, exitTime, pnl, rMultiple: pnl / riskAmount,
      });
    } else {
      closedTrades.push({
        direction, entryTime: nextBar.time, entry, initialSl, size, riskAmount,
        exitPrice: null, exitReason: 'Åpen ved slutten av datasettet', exitTime: null, pnl: 0, rMultiple: 0,
      });
    }

    nextSearchIdx = exitIdx + 1;
  }

  return { balance, closedTrades };
}

module.exports = { runSqueezeEngine };
