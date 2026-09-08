const TIMEFRAMES = [
  { key: '15min', label: '15 min' },
  { key: '30min', label: '30 min' },
  { key: '1h', label: '1 time' },
  { key: '4h', label: '4 timer' },
];

let activeTab = '15min';
let cache = {}; // tfKey -> state
let paramsCache = null;
let lastSync = null;

function fmt(n, d = 2) {
  return n == null || isNaN(n) ? '—' : n.toLocaleString('no-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n, d = 1) {
  return n == null || isNaN(n) ? '—' : (n * 100).toFixed(d) + '%';
}
function pnlClass(n) { return n >= 0 ? 'pos' : 'neg'; }

async function fetchJSON(path) {
  try {
    const res = await fetch(path + '?t=' + Date.now()); // bust GitHub Pages cache
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function computeStats(closedTrades) {
  const N = closedTrades.length;
  if (N === 0) return null;
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = wins.length / N;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

  let running = 0, peak = 0, maxDD = 0;
  closedTrades.forEach((t) => {
    running += t.pnl;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  });

  const longs = closedTrades.filter((t) => t.direction === 'long');
  const shorts = closedTrades.filter((t) => t.direction === 'short');
  const winRateOf = (arr) => (arr.length ? arr.filter((t) => t.pnl > 0).length / arr.length : null);

  const confirmStats = {};
  ['EMA', 'RSI', 'Price action'].forEach((c) => {
    const withC = closedTrades.filter((t) => t.confirmations.includes(c));
    confirmStats[c] = { n: withC.length, winRate: winRateOf(withC) };
  });

  return {
    N, winRate, avgWin, avgLoss, profitFactor, expectancy, maxDD,
    longN: longs.length, longWinRate: winRateOf(longs),
    shortN: shorts.length, shortWinRate: winRateOf(shorts),
    confirmStats,
  };
}

function equityOf(state) {
  const unrealized = state.openTrades.reduce((s, t) => {
    if (state.lastClose == null) return s;
    const pnl = t.direction === 'long' ? t.size * (state.lastClose - t.entry) : t.size * (t.entry - state.lastClose);
    return s + pnl;
  }, 0);
  return state.balance + unrealized;
}

async function loadAll() {
  for (const tf of TIMEFRAMES) {
    cache[tf.key] = await fetchJSON('data/state-' + tf.key + '.json');
  }
  paramsCache = await fetchJSON('data/params.json');
  lastSync = await fetchJSON('data/last-sync.json');
}

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = '';
  TIMEFRAMES.forEach((tf) => {
    const b = document.createElement('button');
    b.textContent = tf.label;
    if (tf.key === activeTab) b.classList.add('active');
    b.onclick = () => { activeTab = tf.key; render(); };
    tabsEl.appendChild(b);
  });
  const cmpBtn = document.createElement('button');
  cmpBtn.textContent = 'Sammenlign';
  if (activeTab === 'compare') cmpBtn.classList.add('active');
  cmpBtn.onclick = () => { activeTab = 'compare'; render(); };
  tabsEl.appendChild(cmpBtn);
}

function renderCompare() {
  let html = `<div class="card"><h2>Sammenligning på tvers av timeframes</h2>
    <div class="tablewrap"><table class="cmp-table">
    <tr><th>Timeframe</th><th>Trades</th><th>Win rate</th><th>PF</th><th>Expectancy</th><th>Maks DD</th><th>Equity</th></tr>`;
  TIMEFRAMES.forEach((tf) => {
    const state = cache[tf.key];
    if (!state) { html += `<tr><td>${tf.label}</td><td colspan="6">Ingen data ennå</td></tr>`; return; }
    const stats = computeStats(state.closedTrades);
    const equity = equityOf(state);
    html += `<tr>
      <td>${tf.label}</td>
      <td>${stats ? stats.N : 0}</td>
      <td>${stats ? fmtPct(stats.winRate) : '—'}</td>
      <td>${stats ? fmt(stats.profitFactor) : '—'}</td>
      <td>${stats ? '$' + fmt(stats.expectancy) : '—'}</td>
      <td>${stats ? '$' + fmt(stats.maxDD) : '—'}</td>
      <td class="${pnlClass(equity - (paramsCache ? paramsCache.startBalance : 10000))}">$${fmt(equity)}</td>
    </tr>`;
  });
  html += `</table></div>
  <div class="footnote">Målet er ikke høyest equity på kort sikt, men å se hvilken timeframe (om noen) som gir en reell statistisk fordel over tid.</div>
  </div>`;
  return html;
}

function renderParams() {
  if (!paramsCache) return '';
  const p = paramsCache;
  return `<div class="card"><h2>Strategiparametere (gjeldende)</h2>
    <div class="paramgrid">
      <div><span>DXY impuls-vindu</span><span>${p.impulseBars} barer</span></div>
      <div><span>Min. DXY-bevegelse</span><span>${p.minDxyImpulseATR} ATR</span></div>
      <div><span>Maks Gold-bevegelse</span><span>${p.maxGoldMoveATR} ATR</span></div>
      <div><span>DXY retracement</span><span>${p.dxyRetracement * 100}%</span></div>
      <div><span>Maks setup-alder</span><span>${p.maxSetupAgeBars} barer</span></div>
      <div><span>EMA</span><span>${p.emaFast}/${p.emaSlow}</span></div>
      <div><span>RSI</span><span>${p.rsiPeriod}</span></div>
      <div><span>ATR-periode</span><span>${p.atrPeriod}</span></div>
      <div><span>Min. bekreftelser</span><span>${p.minConfirmations} av 3</span></div>
      <div><span>Risiko per trade</span><span>${p.riskPct * 100}%</span></div>
      <div><span>Stop loss</span><span>${p.slATR} ATR</span></div>
      <div><span>DXY reversal exit</span><span>${p.dxyReversalExitPct * 100}%</span></div>
    </div>
    <div class="footnote">Endres i src/config.js i repoet — ikke her.</div>
  </div>`;
}

function render() {
  renderTabs();
  const main = document.getElementById('main');
  const status = document.getElementById('syncstatus');

  if (lastSync) {
    status.textContent = 'Sist synkronisert: ' + new Date(lastSync.time).toLocaleString('no-NO');
  } else {
    status.textContent = 'Ingen synkronisering funnet ennå — vent på første kjøring av GitHub Actions.';
  }

  if (activeTab === 'compare') {
    main.innerHTML = renderCompare() + renderParams();
    return;
  }

  const tf = TIMEFRAMES.find((t) => t.key === activeTab);
  const state = cache[tf.key];

  if (!state) {
    main.innerHTML = `<div class="card"><div class="empty">Ingen data for ${tf.label} ennå. Sjekk at GitHub Actions-workflowen har kjørt minst én gang.</div></div>` + renderParams();
    return;
  }

  const stats = computeStats(state.closedTrades);
  const equity = equityOf(state);
  const startBalance = paramsCache ? paramsCache.startBalance : 10000;

  let html = '';
  html += `<div class="card"><h2>Konto — ${tf.label}</h2>
    <div class="grid4">
      <div class="stat"><div class="v">$${fmt(state.balance)}</div><div class="l">Saldo</div></div>
      <div class="stat"><div class="v ${pnlClass(equity - startBalance)}">$${fmt(equity)}</div><div class="l">Equity (inkl. åpne)</div></div>
      <div class="stat"><div class="v">${state.openTrades.length}</div><div class="l">Åpne trades</div></div>
      <div class="stat"><div class="v">${state.closedTrades.length}</div><div class="l">Lukkede trades</div></div>
    </div></div>`;

  html += `<div class="card"><h2>Åpne trades</h2>`;
  if (state.openTrades.length === 0) {
    html += `<div class="empty">Ingen åpne trades.</div>`;
  } else {
    html += `<div class="tablewrap"><table><tr><th>Retning</th><th>Entry</th><th>SL</th><th>Størrelse</th><th>Åpnet</th></tr>`;
    state.openTrades.forEach((t) => {
      html += `<tr><td><span class="badge ${t.direction}">${t.direction === 'long' ? 'LONG' : 'SHORT'}</span></td>
        <td>${fmt(t.entry)}</td><td>${fmt(t.sl)}</td><td>${fmt(t.size, 4)}</td>
        <td>${t.entryTime.slice(5, 16)}</td></tr>`;
    });
    html += `</table></div>`;
  }
  html += `</div>`;

  html += `<div class="card"><h2>Setups under overvåkning</h2>`;
  if (state.pendingSetups.length === 0) {
    html += `<div class="empty">Ingen aktive setups akkurat nå.</div>`;
  } else {
    state.pendingSetups.forEach((s) => {
      html += `<div class="setuprow">
        <div><span class="badge ${s.tradeDirection}">${s.tradeDirection === 'long' ? 'LONG' : 'SHORT'}</span>
          &nbsp;DXY ${s.impulseDir === 'up' ? 'opp' : 'ned'} · ${s.retracementMet ? 'venter på bekreftelse' : 'venter på retracement'}</div>
        <div style="color:var(--dim)">alder: ${s.ageBars}/${paramsCache ? paramsCache.maxSetupAgeBars : 30}</div>
      </div>`;
    });
  }
  html += `</div>`;

  html += `<div class="card"><h2>Statistikk</h2>`;
  if (!stats) {
    html += `<div class="empty">Ingen lukkede trades ennå — statistikk vises her etter hvert.</div>`;
  } else {
    html += `<div class="grid4">
      <div class="stat"><div class="v">${fmtPct(stats.winRate)}</div><div class="l">Win rate (${stats.N} trades)</div></div>
      <div class="stat"><div class="v">${fmt(stats.profitFactor)}</div><div class="l">Profit factor</div></div>
      <div class="stat"><div class="v pos">$${fmt(stats.avgWin)}</div><div class="l">Snitt gevinst</div></div>
      <div class="stat"><div class="v neg">$${fmt(stats.avgLoss)}</div><div class="l">Snitt tap</div></div>
      <div class="stat"><div class="v">$${fmt(stats.expectancy)}</div><div class="l">Expectancy / trade</div></div>
      <div class="stat"><div class="v neg">$${fmt(stats.maxDD)}</div><div class="l">Maks drawdown</div></div>
      <div class="stat"><div class="v">${stats.longN} (${fmtPct(stats.longWinRate)})</div><div class="l">Long — antall (win rate)</div></div>
      <div class="stat"><div class="v">${stats.shortN} (${fmtPct(stats.shortWinRate)})</div><div class="l">Short — antall (win rate)</div></div>
    </div>
    <div class="footnote">Bekreftelse → win rate: ${Object.entries(stats.confirmStats).map(([k, v]) => `${k} (n=${v.n}): ${fmtPct(v.winRate)}`).join(' · ')}</div>`;
  }
  html += `</div>`;

  html += `<div class="card"><h2>Lukkede trades (nyeste først)</h2>`;
  if (state.closedTrades.length === 0) {
    html += `<div class="empty">Ingen lukkede trades ennå.</div>`;
  } else {
    html += `<div class="tablewrap"><table><tr><th>Retning</th><th>Entry</th><th>Exit</th><th>Årsak</th><th>P/L</th></tr>`;
    [...state.closedTrades].reverse().slice(0, 80).forEach((t) => {
      html += `<tr><td><span class="badge ${t.direction}">${t.direction === 'long' ? 'LONG' : 'SHORT'}</span></td>
        <td>${fmt(t.entry)}</td><td>${fmt(t.exitPrice)}</td><td>${t.exitReason}</td>
        <td class="${pnlClass(t.pnl)}">$${fmt(t.pnl)}</td></tr>`;
    });
    html += `</table></div>`;
  }
  html += `</div>`;

  if (lastSync && lastSync.log) {
    html += `<div class="card"><h2>Siste synk-logg</h2><div class="footnote">${lastSync.log.join('<br>')}</div></div>`;
  }

  html += renderParams();

  main.innerHTML = html;
}

async function init() {
  await loadAll();
  render();
}
init();
