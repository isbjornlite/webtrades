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

function runFcrEngine(allBars, PARAMS) {
  const n = allBars.length;
  const cutoff = PARAMS.cutoffTime + ':00';

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

    // 1) build the FCR (09:30–09:35 opening range)
    let fcrHigh = -Infinity, fcrLow = Infinity, fcrCount = 0;
    for (let i = start; i <= end; i++) {
      const t = timeOf(allBars[i]);
      if (t >= PARAMS.fcrStart + ':00' && t < PARAMS.fcrEnd + ':00') {
        fcrHigh = Math.max(fcrHigh, allBars[i].high);
        fcrLow = Math.min(fcrLow, allBars[i].low);
        fcrCount++;
      }
    }
    if (fcrCount === 0) { dayLog.push({ day, status: 'Ingen data ved åpning (09:30)' }); continue; }

    // 2) extreme #1: first break of the FCR range after 09:35, before cutoff
    let extreme1 = null, extreme1Idx = -1;
    for (let i = start; i <= end; i++) {
      const t = timeOf(allBars[i]);
      if (t < PARAMS.fcrEnd + ':00' || t > cutoff) continue;
      const b = allBars[i];
      if (b.high > fcrHigh) { extreme1 = { type: 'high', price: b.high }; extreme1Idx = i; break; }
      if (b.low < fcrLow) { extreme1 = { type: 'low', price: b.low }; extreme1Idx = i; break; }
    }
    if (!extreme1) { dayLog.push({ day, status: `Ingen breakout fra FCR innen ${PARAMS.cutoffTime}` }); continue; }

    // 3) extreme #2: opposite side broken after extreme #1, before cutoff
    let extreme2 = null, extreme2Idx = -1;
    for (let i = extreme1Idx + 1; i <= end; i++) {
      const t = timeOf(allBars[i]);
      if (t > cutoff) break;
      const b = allBars[i];
      if (extreme1.type === 'high' && b.low < fcrLow) { extreme2 = { type: 'low', price: b.low }; extreme2Idx = i; break; }
      if (extreme1.type === 'low' && b.high > fcrHigh) { extreme2 = { type: 'high', price: b.high }; extreme2Idx = i; break; }
    }
    if (!extreme2) { dayLog.push({ day, status: `Motsatt side ikke sveipet innen ${PARAMS.cutoffTime}` }); continue; }

    const direction = extreme2.type === 'low' ? 'long' : 'short';

    // 4) engulfing confirmation after extreme #2, before cutoff
    let entryIdx = -1;
    for (let i = Math.max(extreme2Idx + 1, start + 1); i <= end; i++) {
      const t = timeOf(allBars[i]);
      if (t > cutoff) break;
      const prev = allBars[i - 1];
      const cur = allBars[i];
      if (direction === 'long' && isBullishEngulfing(prev, cur)) { entryIdx = i; break; }
      if (direction === 'short' && isBearishEngulfing(prev, cur)) { entryIdx = i; break; }
    }
    if (entryIdx === -1) { dayLog.push({ day, status: `Ingen engulfing-candle innen ${PARAMS.cutoffTime}` }); continue; }

    // 5) build the trade: entry at engulfing candle's close, SL at the swept extreme, fixed R:R
    const entryBar = allBars[entryIdx];
    const entry = entryBar.close;
    const sl = extreme2.price;
    const riskDist = direction === 'long' ? entry - sl : sl - entry;
    if (riskDist <= 0) { dayLog.push({ day, status: 'Ugyldig risikoavstand, hoppet over' }); continue; }
    const tp = direction === 'long' ? entry + PARAMS.rrRatio * riskDist : entry - PARAMS.rrRatio * riskDist;
    const riskAmount = balance * PARAMS.riskPct;
    const size = riskAmount / riskDist;

    // 6) simulate forward through the full dataset (trade can resolve after this day's data too)
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

module.exports = { runFcrEngine };
