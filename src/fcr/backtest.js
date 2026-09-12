const fs = require('fs');
const path = require('path');
const { PARAMS } = require('./config');
const { fetchSeriesRange, sleep } = require('../dataFetch');
const { runFcrEngine } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', '..', 'docs', 'data');
const REQUEST_DELAY_MS = 8000;
const LOOKBACK_DAYS = parseInt(process.env.FCR_LOOKBACK_DAYS || PARAMS.lookbackDays, 10);

function fmtDate(d) { return d.toISOString().slice(0, 10); }

function buildChunks(lookbackDays, chunkDays) {
  const chunks = [];
  let end = new Date();
  let remaining = lookbackDays;
  while (remaining > 0) {
    const size = Math.min(chunkDays, remaining);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - size);
    chunks.push({ start: fmtDate(start), end: fmtDate(end) });
    end = start;
    remaining -= size;
  }
  return chunks.reverse(); // oldest first
}

async function fetchFullHistory(symbol, apikey) {
  const chunks = buildChunks(LOOKBACK_DAYS, PARAMS.chunkDays);
  const seen = new Map();
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    console.log(`  henter ${symbol} ${c.start} -> ${c.end}...`);
    try {
      const bars = await fetchSeriesRange(symbol, PARAMS.interval, apikey, c.start, c.end, PARAMS.timezone);
      for (const b of bars) seen.set(b.time, b);
    } catch (e) {
      console.error(`    feil: ${e.message}`);
    }
    if (i < chunks.length - 1) await sleep(REQUEST_DELAY_MS);
  }
  return [...seen.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
}

async function main() {
  const apikey = process.env.TWELVE_DATA_API_KEY;
  if (!apikey) {
    console.error('Mangler TWELVE_DATA_API_KEY (sett den som en GitHub Actions secret).');
    process.exit(1);
  }

  console.log(`FCR-backtest: ${LOOKBACK_DAYS} dager tilbake, cutoff ${PARAMS.cutoffTime}\n`);

  const results = {};
  for (const sym of PARAMS.symbols) {
    console.log(`Henter ${sym.label}...`);
    const bars = await fetchFullHistory(sym.td, apikey);
    console.log(`  ${bars.length} 1-min barer hentet totalt`);
    if (bars.length < 100) {
      results[sym.key] = { label: sym.label, error: `For lite historikk (${bars.length} barer)` };
      continue;
    }
    const r = runFcrEngine(bars, PARAMS);
    results[sym.key] = {
      label: sym.label,
      barsProcessed: bars.length,
      fromTime: bars[0].time,
      toTime: bars[bars.length - 1].time,
      finalBalance: r.balance,
      closedTrades: r.closedTrades,
      dayLog: r.dayLog,
    };
    console.log(`  ${r.closedTrades.length} trades, sluttsaldo $${r.balance.toFixed(2)}`);
    await sleep(REQUEST_DELAY_MS);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, 'fcr-backtest.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), lookbackDays: LOOKBACK_DAYS, params: PARAMS, results }, null, 2)
  );

  console.log('\nFCR-backtest ferdig. Resultater lagret i docs/data/fcr-backtest.json.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
