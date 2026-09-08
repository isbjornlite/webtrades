function alignBars(seriesMap) {
  const symbols = Object.keys(seriesMap);
  const timeSets = symbols.map((s) => new Set(seriesMap[s].map((b) => b.time)));
  let common = [...timeSets[0]].filter((t) => timeSets.every((set) => set.has(t)));
  common.sort();

  const indexed = {};
  symbols.forEach((s) => {
    indexed[s] = {};
    seriesMap[s].forEach((b) => { indexed[s][b.time] = b; });
  });

  return common.map((t) => {
    const row = { time: t };
    symbols.forEach((s) => { row[s] = indexed[s][t]; });
    return row;
  });
}

// Official ICE formula for the US Dollar Index, applied to O/H/L/C independently.
function syntheticDXY(aligned) {
  function calc(field) {
    return aligned.map((row) => {
      const eu = row['EUR/USD'][field];
      const uj = row['USD/JPY'][field];
      const gu = row['GBP/USD'][field];
      const uc = row['USD/CAD'][field];
      const us = row['USD/SEK'][field];
      const uf = row['USD/CHF'][field];
      return (
        50.14348112 *
        Math.pow(eu, -0.576) *
        Math.pow(uj, 0.136) *
        Math.pow(gu, -0.119) *
        Math.pow(uc, 0.091) *
        Math.pow(us, 0.042) *
        Math.pow(uf, 0.036)
      );
    });
  }
  const o = calc('open'), h = calc('high'), l = calc('low'), c = calc('close');
  return aligned.map((row, i) => ({ time: row.time, open: o[i], high: h[i], low: l[i], close: c[i] }));
}

module.exports = { alignBars, syntheticDXY };
