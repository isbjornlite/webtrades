const SYMBOLS = [
  { key: 'XAUUSD', label: 'Gold (XAU/USD)' },
  { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)' },
  { key: 'SPY', label: 'S&P 500 (SPY)' },
  { key: 'XAGUSD', label: 'Silver (XAG/USD)' },
];

const TF_ORDER = [
  { key: '15min', label: '15 min' },
  { key: '30min', label: '30 min' },
  { key: '1h', label: '1 time' },
  { key: '4h', label: '4 timer' },
];

let activeSymbol = SYMBOLS[0].key;
let cache = {};

function fmt(n, d = 2) {
  return n == null || isNaN(n) ? '—' : n.toLocaleString('no-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n, d = 1) {
  return n == null || isNaN(n) ? '—' : (n * 100).toFixed(d) + '%';
}
function pnlClass(n) { return n >= 0 ? 'pos' : 'neg'; }

function computeStats(closedTrades) {
  const resolved = closedTrades.filter((t) => t.exitPrice != null);
  const N = resolved.length;
  if (N === 0) return null;
  const wins = resolved.filter((t) => t.pnl > 0);
  const losses = resolved.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = wins.length / N;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const expectancy = (grossWin - grossLoss) / N;

  let running = 0, peak = 0, maxDD = 0;
  resolved.forEach((t) => {
    running += t.pnl;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  });

  return { N, winRate, profitFactor, expectancy, maxDD, openCount: closedTrades.length - N };
}

async function fetchJSON(path) {
  try {
    const res = await fetch(path + '?t=' + Date.now());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function renderSymTabs() {
  const el = document.getElementById('symtabs');
  el.innerHTML = '';
  SYMBOLS.forEach((s) => {
    const b = document.createElement('button');
    b.textContent = s.label;
    if (s.key === activeSymbol) b.classList.add('active');
    b.onclick = () => { activeSymbol = s.key; render(); };
    el.appendChild(b);
  });
}

function renderParams(p) {
  return `<div class="card"><h2>Strategiparametere</h2>
    <div class="paramgrid">
      <div><span>Fractal-styrke</span><span>${p.fractalStrength} barer hver side</span></div>
      <div><span>Maks avstand i sonen</span><span>${p.maxZonePairGapBars} barer</span></div>
      <div><span>Impuls-terskel</span><span>${p.impulseMultiplier}× sonehøyde</span></div>
      <div><span>POC-bins</span><span>${p.pocBins}</span></div>
      <div><span>Risk:Reward</span><span>1:${p.rrRatio}</span></div>
      <div><span>Risiko per trade</span><span>${p.riskPct * 100}%</span></div>
    </div>
  </div>`;
}

async function render() {
  renderSymTabs();
  const status = document.getElementById('syncstatus');
  const main = document.getElementById('main');

  if (!(activeSymbol in cache)) {
    cache[activeSymbol] = await fetchJSON(`data/poc-backtest-${activeSymbol}.json`);
  }
  const data = cache[activeSymbol];

  if (!data) {
    status.textContent = 'Ingen backtest kjørt ennå for dette instrumentet.';
    main.innerHTML = `<div class="card"><div class="empty">
      Kjør workflowen "Backtest POC retest strategy" fra Actions-fanen på GitHub for å generere resultater her.
    </div></div>`;
    return;
  }

  status.textContent = `Kjørt: ${new Date(data.ranAt).toLocaleString('no-NO')} · ${data.outputsize} barer forespurt`;

  let html = '';
  html += `<div class="card"><h2>Sammenligning på tvers av timeframes</h2>
    <div class="tablewrap"><table class="cmp-table">
    <tr><th>Timeframe</th><th>Trades</th><th>Win rate</th><th>PF</th><th>Expectancy</th><th>Maks DD</th><th>Sluttsaldo</th><th>Volumkilde</th></tr>`;
  TF_ORDER.forEach((tf) => {
    const r = data.results[tf.key];
    if (!r || r.error) {
      html += `<tr><td>${tf.label}</td><td colspan="7">${r ? r.error : 'Ingen data'}</td></tr>`;
      return;
    }
    const stats = computeStats(r.closedTrades);
    html += `<tr>
      <td>${tf.label}</td>
      <td>${stats ? stats.N : 0}</td>
      <td>${stats ? fmtPct(stats.winRate) : '—'}</td>
      <td>${stats ? fmt(stats.profitFactor) : '—'}</td>
      <td>${stats ? '$' + fmt(stats.expectancy) : '—'}</td>
      <td>${stats ? '$' + fmt(stats.maxDD) : '—'}</td>
      <td class="${pnlClass(r.finalBalance - 10000)}">$${fmt(r.finalBalance)}</td>
      <td>${r.usedRealVolume ? 'Ekte volum' : 'Presence-proxy'}</td>
    </tr>`;
  });
  html += `</table></div></div>`;

  TF_ORDER.forEach((tf) => {
    const r = data.results[tf.key];
    if (!r || r.error) return;
    const stats = computeStats(r.closedTrades);

    html += `<div class="card"><h2>${tf.label} — detaljer</h2>
      <div class="footnote">Periode: ${r.fromTime} → ${r.toTime} (${r.barsProcessed} barer) · ${r.usedRealVolume ? 'brukte ekte volumdata' : 'ingen ekte volum funnet — falt tilbake til tilstedeværelse-proxy (TPO-stil)'}</div>`;

    if (!stats) {
      html += `<div class="empty" style="margin-top:10px">Ingen fullførte trades i denne perioden.</div></div>`;
      return;
    }

    html += `<div class="grid4" style="margin-top:10px">
      <div class="stat"><div class="v">${fmtPct(stats.winRate)}</div><div class="l">Win rate (${stats.N} trades)</div></div>
      <div class="stat"><div class="v">${fmt(stats.profitFactor)}</div><div class="l">Profit factor</div></div>
      <div class="stat"><div class="v">$${fmt(stats.expectancy)}</div><div class="l">Expectancy / trade</div></div>
      <div class="stat"><div class="v neg">$${fmt(stats.maxDD)}</div><div class="l">Maks drawdown</div></div>
      <div class="stat"><div class="v">${stats.openCount}</div><div class="l">Fortsatt åpne ved slutten</div></div>
    </div></div>`;
  });

  if (data.params) html += renderParams(data.params);

  main.innerHTML = html;
}

render();
