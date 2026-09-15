function timeOf(b) { return b.time.slice(11, 19); } // "HH:MM:SS"
function dayOf(b) { return b.time.slice(0, 10); }   // "YYYY-MM-DD"

function runOrbEngine(allBars, PARAMS) {
  const n = allBars.length;

  const dayRanges = new Map();
  for (let i = 0; i < n; i++) {
    const d = dayOf(allBars[i]);
    if (!dayRanges.has(d)) dayRanges.set(d, { start: i, end: i });
    dayRanges.get(d).end = i;
  }
  const days = [...dayRanges.keys()].sort();

  let balance = PARAMS.startBalance;
  const closedTrades = [];
  const dayLog = [];

  for (const day of days) {
    const { start, end } = dayRanges.get(day);

    // 1) build the opening range (09:30–09:45)
    let orHigh = -Infinity, orLow = Infinity, orCount = 0;
    for (let i = start; i <= end; i++) {
      const t = timeOf(allBars[i]);
      if (t >= PARAMS.orStart + ':00' && t < PARAMS.orEnd + ':00') {
        orHigh = Math.max(orHigh, allBars[i].high);
        orLow = Math.min(orLow, allBars[i].low);
        orCount++;
      }
    }
    if (orCount === 0) { dayLog.push({ day, status: 'Ingen data ved åpning (09:30)' }); continue; }

    // 2) entry signal: the 6th 3-minute candle after 09:45 (10:00–10:02),
    //    built by merging the three underlying 1-min bars. Its close decides
    //    direction relative to the opening range.
    const signalBars = [];
    let lastSignalIdx = -1;
    for (let i = start; i <= end; i++) {
      const t = timeOf(allBars[i]);
      if (t >= PARAMS.signalCandleStart + ':00' && t < PARAMS.signalCandleEnd + ':00') {
        signalBars.push(allBars[i]);
        lastSignalIdx = i;
      }
    }
    if (signalBars.length === 0) {
      dayLog.push({ day, status: `Ingen data i signal-candlen (${PARAMS.signalCandleStart}–${PARAMS.signalCandleEnd})` });
      continue;
    }
    const lastSignalBar = allBars[lastSignalIdx];
    const signalClose = lastSignalBar.close;

    let entryIdx = -1, direction = null;
    if (signalClose > orHigh) direction = 'long';
    else if (signalClose < orLow) direction = 'short';
    if (!direction) {
      dayLog.push({ day, status: 'Signal-candlen lukket innenfor opening range — ingen trade' });
      continue;
    }
    entryIdx = lastSignalIdx;

    // 3) build the trade: entry at signal candle's close, SL at opposite side of the range, fixed R:R
    const entryBar = allBars[entryIdx];
    const entry = entryBar.close;
    const sl = direction === 'long' ? orLow : orHigh;
    const riskDist = direction === 'long' ? entry - sl : sl - entry;
    if (riskDist <= 0) { dayLog.push({ day, status: 'Ugyldig risikoavstand, hoppet over' }); continue; }
    const tp = direction === 'long' ? entry + PARAMS.rrRatio * riskDist : entry - PARAMS.rrRatio * riskDist;
    const riskAmount = balance * PARAMS.riskPct;
    const size = riskAmount / riskDist;

    // 4) simulate forward through the full dataset
    let exitPrice = null, exitReason = null, exitTime = null;
    for (let k = entryIdx + 1; k < n; k++) {
      const b = allBars[k];
      if (direction === 'long') {
        if (b.low <= sl) { exitPrice = sl; exitReason = 'Stop loss'; exitTime = b.time; break; }
        if (b.high >= tp) { exitPrice = tp; exitReason = 'Take profit'; exitTime = b.time; break; }
      } else {
        if (b.high >= sl) { exitPrice = sl; exitReason = 'Stop loss'; exitTime = b.time; break; }
        if (b.low <= tp) { exitPrice = tp; exitReason = 'Take profit'; exitTime = b.time; break; }
      }
    }

    if (exitPrice != null) {
      const pnl = direction === 'long' ? size * (exitPrice - entry) : size * (entry - exitPrice);
      balance += pnl;
      closedTrades.push({
        day, direction, entryTime: entryBar.time, entry, sl, tp, size, riskAmount,
        exitPrice, exitReason, exitTime, pnl, rMultiple: pnl / riskAmount,
      });
      dayLog.push({ day, status: `Trade: ${direction.toUpperCase()} @ ${entry.toFixed(2)} → ${exitReason}` });
    } else {
      dayLog.push({ day, status: `Trade åpnet (${direction}) men ikke avsluttet innenfor datasettet` });
    }
  }

  return { balance, closedTrades, dayLog };
}

module.exports = { runOrbEngine };
