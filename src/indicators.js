function ema(values, period) {
  const out = new Array(values.length).fill(null);
  let seed = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    count++;
    if (count < period) continue;
    if (count === period) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      out[i] = sum / period;
      seed = out[i];
      continue;
    }
    const k = 2 / (period + 1);
    seed = values[i] * k + seed * (1 - k);
    out[i] = seed;
  }
  return out;
}

function rsi(closes, period) {
  const out = new Array(closes.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function atr(bars, period) {
  const tr = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { tr[i] = bars[i].high - bars[i].low; continue; }
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  const out = new Array(bars.length).fill(null);
  let seed = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += tr[j];
      seed = sum / period;
      out[i] = seed;
      continue;
    }
    seed = (seed * (period - 1) + tr[i]) / period;
    out[i] = seed;
  }
  return out;
}

module.exports = { ema, rsi, atr };
