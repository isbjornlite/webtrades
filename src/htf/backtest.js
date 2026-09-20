const fs = require('fs');
const path = require('path');
const { PARAMS } = require('./config');
const { fetchSeries, sleep } = require('../dataFetch');
const { runHtfEngine } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', '..', 'docs', 'data');
const REQUEST_DELAY_MS = 8000;
const OUTPUTSIZE = parseInt(process.env.HTF_BACKTEST_OUTPUTSIZE || PARAMS.outputsize, 10);
const SYMBOL_FILTER = process.env.HTF_BACKTEST_SYMBOL; // optional: run just one symbol (td or key)

async function main() {
  const apikey = process.env.TWELVE_DATA_API_KEY;
  if (!apikey) {
    console.error('Mangler TWELVE_DATA_API_KEY (sett den som en GitHub Actions secret).');
    process.exit(1);
  }

  const symbols = SYMBOL_FILTER
    ? PARAMS.symbols.filter((s) => s.td === SYMBOL_FILTER || s.key === SYMBOL_FILTER)
    : PARAMS.symbols;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const sym of symbols) {
    console.log(`\n=== ${sym.label} ===`);
    const cache = {}; // interval -> bars, reused across pairs that share a timeframe

    async function getBars(interval) {
      if (cache[interval]) return cache[interval];
      console.log(`  henter ${sym.td} (${interval})...`);
      const bars = await fetchSeries(sym.td, interval, apikey, OUTPUTSIZE);
      cache[interval] = bars;
      await sleep(REQUEST_DELAY_MS);
      return bars;
    }

    const results = {};
    for (const pair of PARAMS.pairs) {
      try {
        const htfBars = await getBars(pair.htf);
        const ltfBars = await getBars(pair.ltf);
        if (htfBars.length < 30 || ltfBars.length < 60) {
          results[pair.key] = { label: pair.label, error: `For lite historikk (${htfBars.length} HTF-barer, ${ltfBars.length} LTF-barer)` };
          continue;
        }
        const r = runHtfEngine(ltfBars, htfBars, PARAMS);
        results[pair.key] = {
          label: pair.label,
          htfBars: htfBars.length,
          ltfBars: ltfBars.length,
          keyLevelCount: r.keyLevelCount,
          fromTime: ltfBars[0].time,
          toTime: ltfBars[ltfBars.length - 1].time,
          finalBalance: r.balance,
          closedTrades: r.closedTrades,
        };
        console.log(`  ${pair.label}: ${r.closedTrades.length} trades (av ${r.keyLevelCount} HTF-nivåer), sluttsaldo $${r.balance.toFixed(2)}`);
      } catch (e) {
        console.error(`  Feil (${pair.label}): ${e.message}`);
        results[pair.key] = { label: pair.label, error: e.message };
      }
    }

    fs.writeFileSync(
      path.join(DATA_DIR, `htf-backtest-${sym.key}.json`),
      JSON.stringify({ ranAt: new Date().toISOString(), outputsize: OUTPUTSIZE, startBalance: PARAMS.startBalance, params: PARAMS, results }, null, 2)
    );
  }

  console.log('\nHTF-backtest ferdig.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
