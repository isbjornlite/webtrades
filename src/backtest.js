const fs = require('fs');
const path = require('path');
const { PARAMS, TIMEFRAMES, ALL_SYMBOLS, GOLD_SYMBOL } = require('./config');
const { fetchSeries, sleep } = require('./dataFetch');
const { alignBars, syntheticDXY } = require('./syntheticDxy');
const { runEngine } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', 'docs', 'data');
const REQUEST_DELAY_MS = 8000; // stay safely under Twelve Data's free-tier 8 req/min limit
const OUTPUTSIZE = parseInt(process.env.BACKTEST_OUTPUTSIZE || '5000', 10);

function freshState() {
  return {
    balance: PARAMS.startBalance,
    openTrades: [],
    closedTrades: [],
    pendingSetups: [],
    lastProcessedTime: null,
    lastClose: null,
    nextId: 1,
  };
}

async function main() {
  const apikey = process.env.TWELVE_DATA_API_KEY;
  if (!apikey) {
    console.error('Mangler TWELVE_DATA_API_KEY (sett den som en GitHub Actions secret).');
    process.exit(1);
  }

  console.log(`Kjører backtest med outputsize=${OUTPUTSIZE} barer per symbol/interval.`);
  console.log('Dette er en engangs-analyse over historikk — påvirker IKKE live paper-trading-kontoene.\n');

  const seriesBySymbolInterval = {};
  let callCount = 0;
  const totalCalls = ALL_SYMBOLS.length * TIMEFRAMES.length;

  for (const sym of ALL_SYMBOLS) {
    seriesBySymbolInterval[sym] = {};
    for (const tf of TIMEFRAMES) {
      callCount++;
      console.log(`[${callCount}/${totalCalls}] Henter ${sym} (${tf.label})...`);
      try {
        seriesBySymbolInterval[sym][tf.key] = await fetchSeries(sym, tf.td, apikey, OUTPUTSIZE);
      } catch (e) {
        console.error(`  Feil: ${e.message}`);
        seriesBySymbolInterval[sym][tf.key] = null;
      }
      if (callCount < totalCalls) await sleep(REQUEST_DELAY_MS);
    }
  }

  const results = {};
  for (const tf of TIMEFRAMES) {
    const seriesMap = {};
    let ok = true;
    for (const sym of ALL_SYMBOLS) {
      const bars = seriesBySymbolInterval[sym][tf.key];
      if (!bars) { ok = false; break; }
      seriesMap[sym] = bars;
    }
    if (!ok) {
      results[tf.key] = { label: tf.label, error: 'Manglende data for ett eller flere symboler' };
      console.log(`${tf.label}: hoppet over (manglende data)`);
      continue;
    }

    const aligned = alignBars(seriesMap);
    if (aligned.length < 60) {
      results[tf.key] = { label: tf.label, error: `For lite historikk (${aligned.length} barer)` };
      console.log(`${tf.label}: for lite historikk (${aligned.length} barer)`);
      continue;
    }

    const dxyBars = syntheticDXY(aligned);
    const goldBars = aligned.map((row) => row[GOLD_SYMBOL]);

    const state = freshState();
    runEngine(state, dxyBars, goldBars);

    results[tf.key] = {
      label: tf.label,
      barsProcessed: aligned.length,
      fromTime: aligned[0].time,
      toTime: aligned[aligned.length - 1].time,
      finalBalance: state.balance,
      closedTrades: state.closedTrades,
      openAtEnd: state.openTrades.length,
    };
    console.log(`${tf.label}: ${aligned.length} barer (${aligned[0].time} → ${aligned[aligned.length - 1].time}), ${state.closedTrades.length} trades, sluttsaldo $${state.balance.toFixed(2)}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, 'backtest.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), outputsize: OUTPUTSIZE, results }, null, 2)
  );

  console.log('\nBacktest ferdig. Resultater lagret i docs/data/backtest.json.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
