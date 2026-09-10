const fs = require('fs');
const path = require('path');
const { PARAMS, TIMEFRAMES } = require('./config');
const { fetchSeries, sleep } = require('../dataFetch');
const { runWickEngine } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', '..', 'docs', 'data');
const REQUEST_DELAY_MS = 8000;
const OUTPUTSIZE = parseInt(process.env.WICK_BACKTEST_OUTPUTSIZE || PARAMS.outputsize, 10);

async function main() {
  const apikey = process.env.TWELVE_DATA_API_KEY;
  if (!apikey) {
    console.error('Mangler TWELVE_DATA_API_KEY (sett den som en GitHub Actions secret).');
    process.exit(1);
  }

  console.log(`Wick-strategi backtest: ${PARAMS.symbol}, outputsize=${OUTPUTSIZE}\n`);

  const results = {};
  let call = 0;
  for (const tf of TIMEFRAMES) {
    call++;
    console.log(`[${call}/${TIMEFRAMES.length}] Henter ${PARAMS.symbol} (${tf.label})...`);
    try {
      const bars = await fetchSeries(PARAMS.symbol, tf.td, apikey, OUTPUTSIZE);
      if (bars.length < 60) {
        results[tf.key] = { label: tf.label, error: `For lite historikk (${bars.length} barer)` };
      } else {
        const r = runWickEngine(bars, PARAMS);
        results[tf.key] = {
          label: tf.label,
          barsProcessed: bars.length,
          fromTime: bars[0].time,
          toTime: bars[bars.length - 1].time,
          finalBalance: r.balance,
          closedTrades: r.closedTrades,
          openAtEnd: r.openAtEnd,
        };
        console.log(`  ${tf.label}: ${r.closedTrades.length} trades, sluttsaldo $${r.balance.toFixed(2)}`);
      }
    } catch (e) {
      console.error(`  Feil: ${e.message}`);
      results[tf.key] = { label: tf.label, error: e.message };
    }
    if (call < TIMEFRAMES.length) await sleep(REQUEST_DELAY_MS);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, 'wick-backtest.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), outputsize: OUTPUTSIZE, params: PARAMS, results }, null, 2)
  );

  console.log('\nWick-backtest ferdig. Resultater lagret i docs/data/wick-backtest.json.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
