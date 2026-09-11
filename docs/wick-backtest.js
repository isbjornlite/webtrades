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

  return {
    N, winRate, avgWin, avgLoss, profitFactor, expectancy, maxDD,
    longN: longs.length, longWinRate: winRateOf(longs),
    shortN: shorts.length, shortWinRate: winRateOf(shorts),
  };
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

const TF_ORDER = [
  { key: '15min', label: '15 min' },
  { key: '30min', label: '30 min' },
  { key: '1h', label: '1 time' },
  { key: '4h', label: '4 timer' },
];

function renderParams(p) {
  return `<div class="card"><h2>Strategiparametere (gjeldende)</h2>
    <div class="paramgrid">
      <div><span>Instrument</span><span>${p.symbol}</span></div>
      <div><span>Maks veke-andel</span><span>${p.maxWickPct * 100}% av range</span></div>
      <div><span>ATR-periode</span><span>${p.atrPeriod}</span></div>
      <div><span>Stop loss</span><span>${p.slATR} ATR</span></div>
      <div><span>Take profit</span><span>Dynamisk — neste motsatte likviditetsniv&aring; som dannes etter entry</span></div>
      <div><span>Min. SL-avstand</span><span>${p.minSlDistancePct * 100}% av pris</span></div>
      <div><span>Risiko per trade</span><span>${p.riskPct * 100}%</span></div>
    </div>
    <div class="footnote">Endres i src/wick/config.js — ikke her.</div>
  </div>`;
}

async function render() {
  const data = await fetchJSON('data/wick-backtest.json');
  const status = document.getElementById('syncstatus');
  const main = document.getElementById('main');

  if (!data) {
    status.textContent = 'Ingen backtest kjørt ennå.';
    main.innerHTML = `<div class="card"><div class="empty">
      Kjør workflowen "Backtest no-wick reversal strategy" fra Actions-fanen på GitHub for å generere resultater her.
    </div></div>`;
    return;
  }

  status.textContent = `Kjørt: ${new Date(data.ranAt).toLocaleString('no-NO')} · ${data.outputsize} barer forespurt`;

  let html = '';
  html += `<div class="card"><h2>Sammenligning på tvers av timeframes</h2>
    <div class="tablewrap"><table class="cmp-table">
    <tr><th>Timeframe</th><th>Trades</th><th>Win rate</th><th>PF</th><th>Expectancy</th><th>Maks DD</th><th>Sluttsaldo</th></tr>`;
  TF_ORDER.forEach((tf) => {
    const r = data.results[tf.key];
    if (!r || r.error) {
      html += `<tr><td>${tf.label}</td><td colspan="6">${r ? r.error : 'Ingen data'}</td></tr>`;
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
    </tr>`;
  });
  html += `</table></div></div>`;

  TF_ORDER.forEach((tf) => {
    const r = data.results[tf.key];
    if (!r || r.error) return;
    const stats = computeStats(r.closedTrades);

    html += `<div class="card"><h2>${tf.label} — detaljer</h2>
      <div class="footnote">Periode: ${r.fromTime} → ${r.toTime} (${r.barsProcessed} barer)</div>`;

    if (!stats) {
      html += `<div class="empty">Ingen trades utløst i denne perioden.</div></div>`;
      return;
    }

    html += `<div class="grid4" style="margin-top:10px">
      <div class="stat"><div class="v">${fmtPct(stats.winRate)}</div><div class="l">Win rate (${stats.N} trades)</div></div>
      <div class="stat"><div class="v">${fmt(stats.profitFactor)}</div><div class="l">Profit factor</div></div>
      <div class="stat"><div class="v pos">$${fmt(stats.avgWin)}</div><div class="l">Snitt gevinst</div></div>
      <div class="stat"><div class="v neg">$${fmt(stats.avgLoss)}</div><div class="l">Snitt tap</div></div>
      <div class="stat"><div class="v">$${fmt(stats.expectancy)}</div><div class="l">Expectancy / trade</div></div>
      <div class="stat"><div class="v neg">$${fmt(stats.maxDD)}</div><div class="l">Maks drawdown</div></div>
      <div class="stat"><div class="v">${stats.longN} (${fmtPct(stats.longWinRate)})</div><div class="l">Long — antall (win rate)</div></div>
      <div class="stat"><div class="v">${stats.shortN} (${fmtPct(stats.shortWinRate)})</div><div class="l">Short — antall (win rate)</div></div>
    </div></div>`;
  });

  if (data.params) html += renderParams(data.params);

  main.innerHTML = html;
}

render();
