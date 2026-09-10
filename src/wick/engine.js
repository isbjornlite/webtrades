const { atr } = require('../indicators');

function runWickEngine(bars, PARAMS) {
  const n = bars.length;
  const opens = bars.map((b) => b.open);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const atrArr = atr(bars, PARAMS.atrPeriod);

  const lines = []; // active untapped lines: {price, type: 'support'|'resistance', createdIndex}
  const openTrades = [];
  const closedTrades = [];
  let balance = PARAMS.startBalance;
  let nextId = 1;

  const warmup = PARAMS.atrPeriod + 1;

  for (let i = warmup; i < n; i++) {
    if (atrArr[i] == null) continue;

    // 1) check open trades for TP/SL on this bar
    for (const t of [...openTrades]) {
      let exitPrice = null, reason = null;
      if (t.direction === 'long') {
        if (lows[i] <= t.sl) { exitPrice = t.sl; reason = 'Stop loss'; }
        else if (highs[i] >= t.tp) { exitPrice = t.tp; reason = 'Take profit'; }
      } else {
        if (highs[i] >= t.sl) { exitPrice = t.sl; reason = 'Stop loss'; }
        else if (lows[i] <= t.tp) { exitPrice = t.tp; reason = 'Take profit'; }
      }
      if (exitPrice != null) {
        const pnl = t.direction === 'long'
          ? t.size * (exitPrice - t.entry)
          : t.size * (t.entry - exitPrice);
        balance += pnl;
        closedTrades.push({
          ...t, exitPrice, exitTime: bars[i].time, exitReason: reason, pnl, rMultiple: pnl / t.riskAmount,
        });
        openTrades.splice(openTrades.indexOf(t), 1);
      }
    }

    // 2) check active lines for a tap on this bar
    for (const line of [...lines]) {
      if (line.createdIndex >= i) continue;
      if (lows[i] <= line.price && highs[i] >= line.price) {
        const isLong = line.type === 'support';
        const entry = line.price;
        const slDist = Math.max(PARAMS.slATR * atrArr[i], entry * PARAMS.minSlDistancePct);
        const tpDist = PARAMS.tpATR * atrArr[i];
        const sl = isLong ? entry - slDist : entry + slDist;
        const tp = isLong ? entry + tpDist : entry - tpDist;
        const riskAmount = balance * PARAMS.riskPct;
        const size = riskAmount / slDist;

        openTrades.push({
          id: nextId++,
          direction: isLong ? 'long' : 'short',
          entry, sl, tp, size, riskAmount,
          entryTime: bars[i].time,
          lineType: line.type,
          lineCreatedTime: bars[line.createdIndex].time,
        });
        lines.splice(lines.indexOf(line), 1);
      }
    }

    // 3) detect a new no-wick candle at this bar, create a line
    const range = highs[i] - lows[i];
    if (range > 0) {
      const bodyTop = Math.max(opens[i], closes[i]);
      const bodyBottom = Math.min(opens[i], closes[i]);
      const topWick = highs[i] - bodyTop;
      const botWick = bodyBottom - lows[i];
      const noWick = topWick <= PARAMS.maxWickPct * range && botWick <= PARAMS.maxWickPct * range;
      if (noWick) {
        if (closes[i] > opens[i]) {
          lines.push({ price: lows[i], type: 'support', createdIndex: i });
        } else if (closes[i] < opens[i]) {
          lines.push({ price: highs[i], type: 'resistance', createdIndex: i });
        }
      }
    }
  }

  return { balance, closedTrades, openAtEnd: openTrades.length, linesActiveAtEnd: lines.length };
}

module.exports = { runWickEngine };
