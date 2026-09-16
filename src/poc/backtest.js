const fs = require('fs');
const path = require('path');
const { PARAMS, TIMEFRAMES } = require('./config');
const { fetchSeries, sleep } = require('../dataFetch');
const { runPocEngine } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', '..', 'docs', 'data');
const REQUEST_DELAY_MS = 8000;
const OUTPUTSIZE = parseInt(process.env.POC_BACKTEST_OUTPUTSIZE || PARAMS.outputsize, 10);
const SYMBOL_FILTER = process.env.POC_BACKTEST_SYMBOL; // optional: run just one symbol (td or key)

async function main() {
  const apikey = process.env.TWELVE_DATA_API_KEY;
  if (!apikey) {
    console.error('Mangler TWELVE_DATA_API_KEY (sett den som en GitHub Actions secret).');
    process.exit(1);
  }

  const symbols = SYMBOL_FILTER
    ? PARAMS.symbols.filter((s) => s.td === SYMBOL_FILTER || s.key === SYMBOL_FILTER)
    : PARAMS.symbols;

  for (const sym of symbols) {
    console.log(`\n=== ${sym.label} ===`);
    const results = {};
    let call = 0;
    for (const tf of TIMEFRAMES) {
      call++;
      console.log(`[${call}/${TIMEFRAMES.length}] Henter ${sym.td} (${tf.label})...`);
      try {
        const bars = await fetchSeries(sym.td, tf.td, apikey, OUTPUTSIZE);
        if (bars.length < 60) {
          results[tf.key] = { label: tf.label, error: `For lite historikk (${bars.length} barer)` };
        } else {
          const r = runPocEngine(bars, PARAMS);
          results[tf.key] = {
            label: tf.label,
            barsProcessed: bars.length,
            fromTime: bars[0].time,
            toTime: bars[bars.length - 1].time,
            finalBalance: r.balance,
            closedTrades: r.closedTrades,
            usedRealVolume: r.usedRealVolume,
          };
          console.log(`  ${tf.label}: ${r.closedTrades.length} trades, sluttsaldo $${r.balance.toFixed(2)}, ekte volum: ${r.usedRealVolume}`);
        }
      } catch (e) {
        console.error(`  Feil: ${e.message}`);
        results[tf.key] = { label: tf.label, error: e.message };
      }
      if (call < TIMEFRAMES.length) await sleep(REQUEST_DELAY_MS);
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, `poc-backtest-${sym.key}.json`),
      JSON.stringify({ ranAt: new Date().toISOString(), outputsize: OUTPUTSIZE, params: PARAMS, results }, null, 2)
    );

    if (sym !== symbols[symbols.length - 1]) await sleep(REQUEST_DELAY_MS);
  }

  console.log('\nPOC-backtest ferdig.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
