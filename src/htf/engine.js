const { atr } = require('../indicators');

function findFractals(bars, strength) {
  const points = [];
  for (let i = strength; i < bars.length - strength; i++) {
    let isHigh = true, isLow = true;
    for (let k = 1; k <= strength; k++) {
      if (!(bars[i].high > bars[i - k].high && bars[i].high > bars[i + k].high)) isHigh = false;
      if (!(bars[i].low < bars[i - k].low && bars[i].low < bars[i + k].low)) isLow = false;
    }
    if (isHigh) points.push({ idx: i, type: 'high', price: bars[i].high });
    if (isLow) points.push({ idx: i, type: 'low', price: bars[i].low });
  }
  return points; // ascending by idx already
}

// A strong ("no-wick") HTF candle sets a target level: a bearish one's high is a target
// for a future LONG (price expected to eventually return up to it); a bullish one's low
// is a target for a future SHORT.
function findKeyLevels(htfBars, maxWickPct) {
  const levels = [];
  for (let i = 0; i < htfBars.length; i++) {
    const b = htfBars[i];
    const range = b.high - b.low;
    if (range <= 0) continue;
    const bodyTop = Math.max(b.open, b.close);
    const bodyBottom = Math.min(b.open, b.close);
    const topWick = b.high - bodyTop;
    const botWick = bodyBottom - b.low;
    const noWick = topWick <= maxWickPct * range && botWick <= maxWickPct * range;
    if (!noWick) continue;
    if (b.close > b.open) levels.push({ time: b.time, price: b.low, direction: 'short' });
    else if (b.close < b.open) levels.push({ time: b.time, price: b.high, direction: 'long' });
  }
  return levels;
}

function runHtfEngine(ltfBars, htfBars, PARAMS) {
  const n = ltfBars.length;
  const atrArr = atr(ltfBars, PARAMS.atrPeriod);
  const keyLevels = findKeyLevels(htfBars, PARAMS.maxWickPct);
  const fractals = findFractals(ltfBars, PARAMS.fractalStrength);

  let balance = PARAMS.startBalance;
  const closedTrades = [];
  let cursorLtfIdx = 0;

  for (let levelIdx = 0; levelIdx < keyLevels.length; levelIdx++) {
    const level = keyLevels[levelIdx];
    const nextLevel = keyLevels[levelIdx + 1] || null;
    let endIdxExclusive = n;
    if (nextLevel) {
      for (let i = Math.max(0, cursorLtfIdx); i < n; i++) {
        if (ltfBars[i].time >= nextLevel.time) {
          endIdxExclusive = i;
          break;
        }
      }
    }

    // 1) first LTF bar after the HTF key-level candle formed, not before our cursor
    let startIdx = -1;
    for (let i = Math.max(0, cursorLtfIdx); i < endIdxExclusive; i++) {
      if (ltfBars[i].time > level.time) { startIdx = i; break; }
    }
    if (startIdx === -1) continue;

    // 2) the "liquidity" swing: first LTF fractal (low for a long target, high for a short target)
    const wantType = level.direction === 'long' ? 'low' : 'high';
    let liq = null;
    for (const f of fractals) {
      if (f.idx < startIdx) continue;
      if (f.idx >= endIdxExclusive) break;
      if (f.type !== wantType) continue;
      liq = f;
      break;
    }
    if (!liq) continue;
    const liqConfirmedIdx = liq.idx + PARAMS.fractalStrength;

    // 3) the sweep: a bar wicking beyond that liquidity level
    let sweepIdx = -1;
    for (let i = liqConfirmedIdx; i < endIdxExclusive; i++) {
      if (level.direction === 'long' && ltfBars[i].low < liq.price) { sweepIdx = i; break; }
      if (level.direction === 'short' && ltfBars[i].high > liq.price) { sweepIdx = i; break; }
    }
    if (sweepIdx === -1) continue;

    // 4) a small, tight consolidation zone (order-block style) right after the sweep
    const zoneStart = sweepIdx + 1;
    const zoneEnd = zoneStart + PARAMS.consolidationLookback - 1;
    if (zoneEnd >= endIdxExclusive) continue;
    let zoneHigh = -Infinity, zoneLow = Infinity;
    for (let i = zoneStart; i <= zoneEnd; i++) {
      zoneHigh = Math.max(zoneHigh, ltfBars[i].high);
      zoneLow = Math.min(zoneLow, ltfBars[i].low);
    }
    const zoneAtr = atrArr[zoneEnd] || atrArr[zoneStart];
    if (!zoneAtr || (zoneHigh - zoneLow) > PARAMS.consolidationMaxATR * zoneAtr) continue;

    // 5) breakout of that zone, in the target direction
    const breakoutIdx = zoneEnd + 1;
    if (breakoutIdx >= endIdxExclusive) continue;
    const breakoutBar = ltfBars[breakoutIdx];
    let direction = null;
    if (level.direction === 'long' && breakoutBar.close > zoneHigh) direction = 'long';
    if (level.direction === 'short' && breakoutBar.close < zoneLow) direction = 'short';
    if (!direction) continue;

    const entry = breakoutBar.close;
    if (direction === 'long' && entry >= level.price) continue;   // HTF target already behind us
    if (direction === 'short' && entry <= level.price) continue;

    const sl = direction === 'long' ? zoneLow : zoneHigh;
    const riskDist = direction === 'long' ? entry - sl : sl - entry;
    if (riskDist <= 0) continue;
    const tp = level.price; // dynamic TP = the HTF key level itself
    const riskAmount = balance * PARAMS.riskPct;
    const size = riskAmount / riskDist;

    let exitPrice = null, exitReason = null, exitTime = null, exitIdx = n;
    for (let k = breakoutIdx + 1; k < endIdxExclusive; k++) {
      const b = ltfBars[k];
      if (direction === 'long') {
        const hitSl = b.low <= sl;
        const hitTp = b.high >= tp;
        if (hitSl && hitTp) { exitPrice = sl; exitReason = 'Stop loss (intrabar tie-break)'; exitTime = b.time; exitIdx = k; break; }
        if (hitSl) { exitPrice = sl; exitReason = 'Stop loss'; exitTime = b.time; exitIdx = k; break; }
        if (hitTp) { exitPrice = tp; exitReason = 'Take profit (HTF level)'; exitTime = b.time; exitIdx = k; break; }
      } else {
        const hitSl = b.high >= sl;
        const hitTp = b.low <= tp;
        if (hitSl && hitTp) { exitPrice = sl; exitReason = 'Stop loss (intrabar tie-break)'; exitTime = b.time; exitIdx = k; break; }
        if (hitSl) { exitPrice = sl; exitReason = 'Stop loss'; exitTime = b.time; exitIdx = k; break; }
        if (hitTp) { exitPrice = tp; exitReason = 'Take profit (HTF level)'; exitTime = b.time; exitIdx = k; break; }
      }
    }

    if (exitPrice != null) {
      const pnl = direction === 'long' ? size * (exitPrice - entry) : size * (entry - exitPrice);
      balance += pnl;
      closedTrades.push({
        direction, htfLevelTime: level.time, tp, entryTime: breakoutBar.time, entry, sl, size, riskAmount,
        exitPrice, exitReason, exitTime, pnl, rMultiple: pnl / riskAmount,
      });
    } else {
      closedTrades.push({
        direction, htfLevelTime: level.time, tp, entryTime: breakoutBar.time, entry, sl, size, riskAmount,
        exitPrice: null, exitReason: 'Open at end of dataset', exitTime: null, pnl: 0, rMultiple: 0,
      });
    }

    cursorLtfIdx = exitPrice != null ? exitIdx + 1 : breakoutIdx + 1;
  }

  return { balance, closedTrades, keyLevelCount: keyLevels.length };
}

module.exports = { runHtfEngine };
