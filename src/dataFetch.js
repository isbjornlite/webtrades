const BASE = 'https://api.twelvedata.com/time_series';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSeries(symbol, interval, apikey, outputsize) {
  const url = `${BASE}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${encodeURIComponent(apikey)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'error' || !data.values) {
    throw new Error(`${symbol} (${interval}): ${data.message || 'ukjent feil fra Twelve Data'}`);
  }
  const bars = data.values.map((v) => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume != null ? parseFloat(v.volume) || 0 : 0,
  }));
  bars.reverse(); // Twelve Data returns newest-first; we want ascending
  return bars;
}

async function fetchSeriesRange(symbol, interval, apikey, startDate, endDate, timezone) {
  const params = new URLSearchParams({
    symbol, interval, start_date: startDate, end_date: endDate, outputsize: '5000', apikey,
  });
  if (timezone) params.set('timezone', timezone);
  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'error') {
    throw new Error(`${symbol} (${interval}) ${startDate}..${endDate}: ${data.message || 'ukjent feil fra Twelve Data'}`);
  }
  if (!data.values) return [];
  const bars = data.values.map((v) => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }));
  bars.reverse();
  return bars;
}

module.exports = { fetchSeries, fetchSeriesRange, sleep };
