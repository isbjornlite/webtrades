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
  points.sort((a, b) => a.idx - b.idx);
  return points;
}

function runZoneEngine(bars, PARAMS) {
  const n = bars.length;
  const fractals = findFractals(bars, PARAMS.fractalStrength);

  let balance = PARAMS.startBalance;
  const closedTrades = [];
  let nextSearchIdx = 0;

  for (let f = 1; f < fractals.length; f++) {
    const a = fractals[f - 1], b = fractals[f];
    if (a.type === b.type) continue;
    if (b.idx - a.idx > PARAMS.maxZonePairGapBars) continue;

    const confirmedAt = Math.max(a.idx, b.idx) + PARAMS.fractalStrength;
    if (confirmedAt < nextSearchIdx) continue; // still inside a previous trade's window

    const zoneHigh = a.type === 'high' ? a.price : b.price;
    const zoneLow = a.type === 'low' ? a.price : b.price;
    const zoneHeight = zoneHigh - zoneLow;
    if (zoneHeight <= 0) continue;

    // 1) impulsive breakout: price travels at least impulseMultiplier zone-heights beyond the zone
    const upTrigger = zoneHigh + PARAMS.impulseMultiplier * zoneHeight;
    const downTrigger = zoneLow - PARAMS.impulseMultiplier * zoneHeight;
    let breakoutIdx = -1, breakoutDir = null;
    for (let i = confirmedAt + 1; i < n; i++) {
      if (bars[i].high >= upTrigger) { breakoutIdx = i; breakoutDir = 'up'; break; }
      if (bars[i].low <= downTrigger) { breakoutIdx = i; breakoutDir = 'down'; break; }
    }
    if (breakoutIdx === -1) continue;

    // 2) retest: price returns to overlap the zone
    let retestIdx = -1;
    for (let i = breakoutIdx + 1; i < n; i++) {
      if (bars[i].low <= zoneHigh && bars[i].high >= zoneLow) { retestIdx = i; break; }
    }
    if (retestIdx === -1) continue;

    // 3) enter in the breakout direction (continuation)
    const direction = breakoutDir === 'down' ? 'short' : 'long';
    const entryBar = bars[retestIdx];
    const entry = entryBar.close;
    const sl = direction === 'short' ? zoneHigh : zoneLow;
    const riskDist = direction === 'short' ? sl - entry : entry - sl;
    if (riskDist <= 0) continue;
    const tp = direction === 'short' ? entry - PARAMS.rrRatio * riskDist : entry + PARAMS.rrRatio * riskDist;
    const riskAmount = balance * PARAMS.riskPct;
    const size = riskAmount / riskDist;

    let exitPrice = null, exitReason = null, exitTime = null, exitIdx = n;
    for (let k = retestIdx + 1; k < n; k++) {
      const bar = bars[k];
      if (direction === 'long') {
        if (bar.low <= sl) { exitPrice = sl; exitReason = 'Stop loss'; exitTime = bar.time; exitIdx = k; break; }
        if (bar.high >= tp) { exitPrice = tp; exitReason = 'Take profit'; exitTime = bar.time; exitIdx = k; break; }
      } else {
        if (bar.high >= sl) { exitPrice = sl; exitReason = 'Stop loss'; exitTime = bar.time; exitIdx = k; break; }
        if (bar.low <= tp) { exitPrice = tp; exitReason = 'Take profit'; exitTime = bar.time; exitIdx = k; break; }
      }
    }

    if (exitPrice != null) {
      const pnl = direction === 'long' ? size * (exitPrice - entry) : size * (entry - exitPrice);
      balance += pnl;
      closedTrades.push({
        direction, zoneHigh, zoneLow, entryTime: entryBar.time, entry, sl, tp, size, riskAmount,
        exitPrice, exitReason, exitTime, pnl, rMultiple: pnl / riskAmount,
      });
    } else {
      closedTrades.push({
        direction, zoneHigh, zoneLow, entryTime: entryBar.time, entry, sl, tp, size, riskAmount,
        exitPrice: null, exitReason: 'Åpen ved slutten av datasettet', exitTime: null, pnl: 0, rMultiple: 0,
      });
    }

    nextSearchIdx = exitIdx + 1;
  }

  return { balance, closedTrades };
}

module.exports = { runZoneEngine };
