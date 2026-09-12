function isBullish(b) { return b.close > b.open; }
function isBearish(b) { return b.close < b.open; }

function isBullishEngulfing(prev, cur) {
  return isBearish(prev) && isBullish(cur) && cur.open <= prev.close && cur.close >= prev.open;
}
function isBearishEngulfing(prev, cur) {
  return isBullish(prev) && isBearish(cur) && cur.open >= prev.close && cur.close <= prev.open;
}

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

    // 2) breakout after 09:45, no time limit for the rest of the day
    let breakoutType = null, breakoutIdx = -1;
    for (let i = start; i <= end; i++) {
      const t = timeOf(allBars[i]);
      if (t < PARAMS.orEnd + ':00') continue;
      const b = allBars[i];
      if (b.high > orHigh) { breakoutType = 'up'; breakoutIdx = i; break; }
      if (b.low < orLow) { breakoutType = 'down'; breakoutIdx = i; break; }
    }
    if (!breakoutType) { dayLog.push({ day, status: 'Ingen brudd av opening range' }); continue; }

    const direction = breakoutType === 'up' ? 'long' : 'short';
    const level = breakoutType === 'up' ? orHigh : orLow;

    // 3) retest: first bar after the breakout whose range touches the broken level
    let retestIdx = -1;
    for (let i = breakoutIdx + 1; i <= end; i++) {
      const b = allBars[i];
      if (b.low <= level && b.high >= level) { retestIdx = i; break; }
    }
    if (retestIdx === -1) { dayLog.push({ day, status: 'Ingen retest av nivået' }); continue; }

    // 4) confirmation: an engulfing candle in the trade direction, after the retest
    let entryIdx = -1;
    for (let i = Math.max(retestIdx + 1, start + 1); i <= end; i++) {
      const prev = allBars[i - 1];
      const cur = allBars[i];
      if (direction === 'long' && isBullishEngulfing(prev, cur)) { entryIdx = i; break; }
      if (direction === 'short' && isBearishEngulfing(prev, cur)) { entryIdx = i; break; }
    }
    if (entryIdx === -1) { dayLog.push({ day, status: 'Ingen bekreftelsescandle etter retest' }); continue; }

    // 5) build the trade: entry at confirmation candle's close, SL beyond the confirmation pattern, fixed R:R
    const entryBar = allBars[entryIdx];
    const prevBar = allBars[entryIdx - 1];
    const entry = entryBar.close;
    const sl = direction === 'long' ? Math.min(prevBar.low, entryBar.low) : Math.max(prevBar.high, entryBar.high);
    const riskDist = direction === 'long' ? entry - sl : sl - entry;
    if (riskDist <= 0) { dayLog.push({ day, status: 'Ugyldig risikoavstand, hoppet over' }); continue; }
    const tp = direction === 'long' ? entry + PARAMS.rrRatio * riskDist : entry - PARAMS.rrRatio * riskDist;
    const riskAmount = balance * PARAMS.riskPct;
    const size = riskAmount / riskDist;

    // 6) simulate forward through the full dataset
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
