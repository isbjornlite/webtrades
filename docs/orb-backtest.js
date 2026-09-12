const SYMBOLS = [
  { key: 'XAUUSD', label: 'Gold (XAU/USD)' },
  { key: 'BTCUSD', label: 'Bitcoin (BTC/USD)' },
  { key: 'SPY', label: 'S&P 500 (SPY)' },
  { key: 'XAGUSD', label: 'Silver (XAG/USD)' },
];

let activeSymbol = SYMBOLS[0].key;
let cachedData = null;

function fmt(n, d = 2) {
  return n == null || isNaN(n) ? '—' : n.toLocaleString('no-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n, d = 1) {
  return n == null || isNaN(n) ? '—' : (n * 100).toFixed(d) + '%';
}
function pnlClass(n) { return n >= 0 ? 'pos' : 'neg'; }

function computeStats(closedTrades) {
  const N = closedTrades.length;
  if (N === 0) return null;
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = wins.length / N;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const expectancy = (grossWin - grossLoss) / N;

  let running = 0, peak = 0, maxDD = 0;
  closedTrades.forEach((t) => {
    running += t.pnl;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  });

  return { N, winRate, profitFactor, expectancy, maxDD };
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
      <div><span>Opening range</span><span>${p.orStart}–${p.orEnd} EST</span></div>
      <div><span>Risk:Reward</span><span>1:${p.rrRatio}</span></div>
      <div><span>Risiko per trade</span><span>${p.riskPct * 100}%</span></div>
      <div><span>Kjøringsvindu hentet</span><span>${p.lookbackDays} dager</span></div>
    </div>
    <div class="footnote">Kun ett forsøk per dag. Ingen tidsgrense for når brudd + retest må skje etter ${p.orEnd}.</div>
  </div>`;
}

async function render() {
  renderSymTabs();
  const status = document.getElementById('syncstatus');
  const main = document.getElementById('main');

  if (!cachedData) cachedData = await fetchJSON('data/orb-backtest.json');
  const data = cachedData;

  if (!data) {
    status.textContent = 'Ingen backtest kjørt ennå.';
    main.innerHTML = `<div class="card"><div class="empty">
      Kjør workflowen "Backtest ORB retest strategy" fra Actions-fanen på GitHub for å generere resultater her.
    </div></div>`;
    return;
  }

  const r = data.results[activeSymbol];
  status.textContent = `Kjørt: ${new Date(data.ranAt).toLocaleString('no-NO')} · ${data.lookbackDays} dager forespurt`;

  if (!r || r.error) {
    main.innerHTML = `<div class="card"><div class="empty">${r ? r.error : 'Ingen data for dette instrumentet.'}</div></div>`;
    return;
  }

  const stats = computeStats(r.closedTrades);
  let html = '';

  html += `<div class="card"><h2>${r.label}</h2>
    <div class="footnote">Periode: ${r.fromTime} → ${r.toTime} (${r.barsProcessed} 1-min-barer)</div>`;

  if (!stats) {
    html += `<div class="empty" style="margin-top:10px">Ingen fullførte trades i denne perioden — se dagsloggen under for hvorfor.</div></div>`;
  } else {
    html += `<div class="grid4" style="margin-top:10px">
      <div class="stat"><div class="v">${fmtPct(stats.winRate)}</div><div class="l">Win rate (${stats.N} trades)</div></div>
      <div class="stat"><div class="v">${fmt(stats.profitFactor)}</div><div class="l">Profit factor</div></div>
      <div class="stat"><div class="v">$${fmt(stats.expectancy)}</div><div class="l">Expectancy / trade</div></div>
      <div class="stat"><div class="v neg">$${fmt(stats.maxDD)}</div><div class="l">Maks drawdown</div></div>
      <div class="stat ${pnlClass(r.finalBalance - 10000)}"><div class="v">$${fmt(r.finalBalance)}</div><div class="l">Sluttsaldo</div></div>
    </div></div>`;

    html += `<div class="card"><h2>Trades</h2><div class="tablewrap"><table class="cmp-table">
      <tr><th>Dag</th><th>Retning</th><th>Entry</th><th>SL</th><th>TP</th><th>Utfall</th><th>R</th></tr>`;
    r.closedTrades.forEach((t) => {
      html += `<tr>
        <td>${t.day}</td>
        <td>${t.direction.toUpperCase()}</td>
        <td>${fmt(t.entry)}</td>
        <td>${fmt(t.sl)}</td>
        <td>${fmt(t.tp)}</td>
        <td class="${pnlClass(t.pnl)}">${t.exitReason}</td>
        <td class="${pnlClass(t.pnl)}">${fmt(t.rMultiple)}R</td>
      </tr>`;
    });
    html += `</table></div></div>`;
  }

  html += `<div class="card"><h2>Dagslogg</h2>
    <div class="tablewrap"><table class="cmp-table">
    <tr><th>Dag</th><th>Status</th></tr>`;
  r.dayLog.forEach((d) => {
    html += `<tr><td>${d.day}</td><td>${d.status}</td></tr>`;
  });
  html += `</table></div></div>`;

  html += renderParams(data.params);

  main.innerHTML = html;
}

render();
