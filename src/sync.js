const fs = require('fs');
const path = require('path');
const { PARAMS, TIMEFRAMES, ALL_SYMBOLS, GOLD_SYMBOL } = require('./config');
const { fetchSeries, sleep } = require('./dataFetch');
const { alignBars, syntheticDXY } = require('./syntheticDxy');
const { runEngine } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', 'docs', 'data');
const REQUEST_DELAY_MS = 8000; // stay safely under Twelve Data's free-tier 8 req/min limit

function loadState(tfKey) {
  const file = path.join(DATA_DIR, `state-${tfKey}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
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

function saveState(tfKey, state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, `state-${tfKey}.json`), JSON.stringify(state, null, 2));
}

async function main() {
  const apikey = process.env.TWELVE_DATA_API_KEY;
  if (!apikey) {
    console.error('Mangler TWELVE_DATA_API_KEY (sett den som en GitHub Actions secret).');
    process.exit(1);
  }

  const seriesBySymbolInterval = {};
  let callCount = 0;
  const totalCalls = ALL_SYMBOLS.length * TIMEFRAMES.length;

  for (const sym of ALL_SYMBOLS) {
    seriesBySymbolInterval[sym] = {};
    for (const tf of TIMEFRAMES) {
      callCount++;
      console.log(`[${callCount}/${totalCalls}] Henter ${sym} (${tf.label})...`);
      try {
        seriesBySymbolInterval[sym][tf.key] = await fetchSeries(sym, tf.td, apikey, PARAMS.outputsize);
      } catch (e) {
        console.error(`  Feil: ${e.message}`);
        seriesBySymbolInterval[sym][tf.key] = null;
      }
      if (callCount < totalCalls) await sleep(REQUEST_DELAY_MS);
    }
  }

  const syncLog = [];
  for (const tf of TIMEFRAMES) {
    const seriesMap = {};
    let ok = true;
    for (const sym of ALL_SYMBOLS) {
      const bars = seriesBySymbolInterval[sym][tf.key];
      if (!bars) { ok = false; break; }
      seriesMap[sym] = bars;
    }
    if (!ok) { syncLog.push(`${tf.label}: hoppet over (manglende data for ett eller flere symboler)`); continue; }

    const aligned = alignBars(seriesMap);
    if (aligned.length < 60) { syncLog.push(`${tf.label}: for lite historikk (${aligned.length} barer)`); continue; }

    const dxyBars = syntheticDXY(aligned);
    const goldBars = aligned.map((row) => row[GOLD_SYMBOL]);

    const state = loadState(tf.key);
    const result = runEngine(state, dxyBars, goldBars);
    saveState(tf.key, state);

    syncLog.push(`${tf.label}: ${result.newTrades} nye trades, ${result.closedNow} lukket, ${result.newSetups} nye setups`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'params.json'), JSON.stringify(PARAMS, null, 2));
  fs.writeFileSync(
    path.join(DATA_DIR, 'last-sync.json'),
    JSON.stringify({ time: new Date().toISOString(), log: syncLog }, null, 2)
  );

  console.log('\nFerdig:\n' + syncLog.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
