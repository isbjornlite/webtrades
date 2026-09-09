const { PARAMS } = require('./config');
const { ema, rsi, atr } = require('./indicators');

function runEngine(state, dxyBars, goldBars) {
  const n = dxyBars.length;
  const dxyClose = dxyBars.map((b) => b.close);
  const goldClose = goldBars.map((b) => b.close);
  const goldOpen = goldBars.map((b) => b.open);
  const goldHigh = goldBars.map((b) => b.high);
  const goldLow = goldBars.map((b) => b.low);

  const dxyATR = atr(dxyBars, PARAMS.atrPeriod);
  const goldATR = atr(goldBars, PARAMS.atrPeriod);
  const goldEMAf = ema(goldClose, PARAMS.emaFast);
  const goldEMAs = ema(goldClose, PARAMS.emaSlow);
  const goldRSI = rsi(goldClose, PARAMS.rsiPeriod);

  const warmup = Math.max(PARAMS.emaSlow, PARAMS.atrPeriod, PARAMS.impulseBars) + 1;
  let startIdx = warmup;
  if (state.lastProcessedTime) {
    const idx = dxyBars.findIndex((b) => b.time === state.lastProcessedTime);
    if (idx >= 0) startIdx = Math.max(startIdx, idx + 1);
  }

  let newTrades = 0, newSetups = 0, closedNow = 0;

  for (let i = startIdx; i < n; i++) {
    if (dxyATR[i] == null || goldATR[i] == null || i - PARAMS.impulseBars < 0) continue;

    state.pendingSetups.forEach((s) => s.ageBars++);
    state.pendingSetups = state.pendingSetups.filter((s) => s.ageBars <= PARAMS.maxSetupAgeBars);

    // 1) detect new DXY/Gold mismatch
    const dxyMove = dxyClose[i] - dxyClose[i - PARAMS.impulseBars];
    const dxyMoveATR = Math.abs(dxyMove) / dxyATR[i];
    const goldMove = goldClose[i] - goldClose[i - PARAMS.impulseBars];
    const goldMoveATR = Math.abs(goldMove) / goldATR[i];

    if (dxyMoveATR >= PARAMS.minDxyImpulseATR && goldMoveATR <= PARAMS.maxGoldMoveATR) {
      const impulseDir = dxyMove > 0 ? 'up' : 'down';
      const alreadyPending = state.pendingSetups.some(
        (s) => s.impulseDir === impulseDir && s.ageBars < PARAMS.impulseBars
      );
      if (!alreadyPending) {
        state.pendingSetups.push({
          id: state.nextId++,
          impulseDir,
          tradeDirection: impulseDir === 'up' ? 'long' : 'short',
          impulseStart: dxyClose[i - PARAMS.impulseBars],
          impulseEnd: dxyClose[i],
          detectedTime: dxyBars[i].time,
          ageBars: 0,
          retracementMet: false,
        });
        newSetups++;
      }
    }

    // 2) track retracement
    for (const setup of state.pendingSetups) {
      if (setup.retracementMet) continue;
      const range = Math.abs(setup.impulseEnd - setup.impulseStart);
      if (range === 0) continue;
      const retrace = setup.impulseDir === 'up'
        ? (setup.impulseEnd - dxyClose[i]) / range
        : (dxyClose[i] - setup.impulseEnd) / range;
      if (retrace >= PARAMS.dxyRetracement) setup.retracementMet = true;
    }

    // 3) check confirmations, open trades
    // At most one new trade per direction per bar — prevents multiple pending
    // setups maturing on the same bar from stacking near-identical trades.
    let openedLongThisBar = false;
    let openedShortThisBar = false;

    for (const setup of [...state.pendingSetups]) {
      if (!setup.retracementMet) continue;
      if (goldEMAf[i] == null || goldEMAs[i] == null || goldRSI[i] == null) continue;

      const isLong = setup.tradeDirection === 'long';
      if (isLong && openedLongThisBar) continue;
      if (!isLong && openedShortThisBar) continue;

      const emaOk = isLong
        ? goldClose[i] > goldEMAf[i] && goldEMAf[i] > goldEMAs[i]
        : goldClose[i] < goldEMAf[i] && goldEMAf[i] < goldEMAs[i];
      const rsiOk = isLong ? goldRSI[i] > 50 : goldRSI[i] < 50;
      const bodyBull = goldClose[i] > goldOpen[i];
      const bodyBear = goldClose[i] < goldOpen[i];
      const paOk = isLong
        ? bodyBull && goldClose[i] > goldClose[i - 1]
        : bodyBear && goldClose[i] < goldClose[i - 1];

      const confirmations = [];
      if (emaOk) confirmations.push('EMA');
      if (rsiOk) confirmations.push('RSI');
      if (paOk) confirmations.push('Price action');

      if (confirmations.length >= PARAMS.minConfirmations) {
        const entry = goldClose[i];
        // Safety floor: never let an unusually low ATR shrink the stop
        // distance (and therefore inflate position size) to an extreme.
        const slDist = Math.max(PARAMS.slATR * goldATR[i], entry * PARAMS.minSlDistancePct);
        const sl = isLong ? entry - slDist : entry + slDist;
        const riskAmount = state.balance * PARAMS.riskPct;
        const size = riskAmount / slDist;

        state.openTrades.push({
          id: state.nextId++,
          direction: setup.tradeDirection,
          entry, sl, size, riskAmount,
          entryTime: dxyBars[i].time,
          entryDXY: dxyClose[i],
          confirmations,
        });
        newTrades++;
        if (isLong) openedLongThisBar = true; else openedShortThisBar = true;
        state.pendingSetups = state.pendingSetups.filter((s) => s.id !== setup.id);
      }
    }

    // 4) check exits
    for (const t of [...state.openTrades]) {
      let exitPrice = null, reason = null;
      if (t.direction === 'long') {
        if (goldLow[i] <= t.sl) { exitPrice = t.sl; reason = 'Stop loss'; }
        else if ((dxyClose[i] - t.entryDXY) / t.entryDXY >= PARAMS.dxyReversalExitPct) {
          exitPrice = goldClose[i]; reason = 'DXY reversal';
        }
      } else {
        if (goldHigh[i] >= t.sl) { exitPrice = t.sl; reason = 'Stop loss'; }
        else if ((t.entryDXY - dxyClose[i]) / t.entryDXY >= PARAMS.dxyReversalExitPct) {
          exitPrice = goldClose[i]; reason = 'DXY reversal';
        }
      }
      if (exitPrice != null) {
        const pnl = t.direction === 'long' ? t.size * (exitPrice - t.entry) : t.size * (t.entry - exitPrice);
        state.balance += pnl;
        state.closedTrades.push({
          ...t, exitPrice, exitTime: dxyBars[i].time, exitReason: reason, pnl, rMultiple: pnl / t.riskAmount,
        });
        state.openTrades = state.openTrades.filter((o) => o.id !== t.id);
        closedNow++;
      }
    }
  }

  if (n > 0) {
    state.lastProcessedTime = dxyBars[n - 1].time;
    state.lastClose = goldClose[n - 1];
  }
  return { newTrades, newSetups, closedNow };
}

module.exports = { runEngine };
