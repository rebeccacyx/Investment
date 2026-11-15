const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/portfolio.json');
const { PortfolioService } = require('../src/services/PortfolioService');
const { SimulationService, SimulationError } = require('../src/services/SimulationService');

const portfolioService = new PortfolioService();
const simulationService = new SimulationService();
const snapshotId = fixture.snapshot_id;
const holding = (result, symbol) => result.holdings.find((item) => item.symbol === symbol);
const industry = (result, name) => result.industries.find((item) => item.industry === name);
const alertKeys = (result) => result.alerts.map((item) => `${item.type}:${item.symbol || item.industry}`);

test('AC-01: original valuation and concentration', () => {
  const result = portfolioService.analyze(fixture);
  assert.equal(result.totalAssets, '100000.00');
  assert.equal(result.cash, '20000.00');
  assert.equal(result.investedValue, '80000.00');
  assert.equal(result.snapshotAt, '2026-11-02T15:00:00+08:00');
  assert.equal(result.holdings.length, 6);
  assert.equal(holding(result, 'A01').marketValue, '40000.00');
  assert.equal(holding(result, 'A01').allocationPercent, '40.00');
  assert.equal(industry(result, '科技').marketValue, '60000.00');
  assert.equal(industry(result, '科技').allocationPercent, '60.00');
  assert.deepEqual(alertKeys(result), ['instrument:A01', 'industry:科技']);
  assert.equal(result.alerts[0].thresholdPercent, '30.00');
  assert.equal(result.alerts[1].thresholdPercent, '50.00');
});

test('AC-02: equality with both thresholds clears alerts', () => {
  const { original, simulated, changes } = simulationService.simulate(fixture, snapshotId,
    [{ type: 'sell', symbol: 'A01', quantity: 100 }]);
  assert.equal(original.cash, '20000.00');
  assert.equal(simulated.cash, '30000.00');
  assert.equal(simulated.totalAssets, '100000.00');
  assert.equal(holding(simulated, 'A01').quantity, 300);
  assert.equal(holding(simulated, 'A01').marketValue, '30000.00');
  assert.equal(holding(simulated, 'A01').allocationPercent, '30.00');
  assert.equal(industry(simulated, '科技').allocationPercent, '50.00');
  assert.deepEqual(simulated.alerts, []);
  assert.equal(changes.cash, '10000.00');
  assert.equal(changes.totalAssets, '0.00');
  assert.equal(changes.holdings.find((item) => item.symbol === 'A01').quantity, -100);
  assert.equal(changes.industries.find((item) => item.industry === '科技').allocationPercent, '-10.00');
});

test('AC-03: trades execute in order, preserve assets, and restore industry alert', () => {
  const result = simulationService.simulate(fixture, snapshotId, [
    { type: 'sell', symbol: 'A01', quantity: 100 },
    { type: 'buy', symbol: 'A02', quantity: 100 },
  ]);
  const { simulated, changes } = result;
  assert.equal(simulated.cash, '25000.00');
  assert.equal(simulated.totalAssets, result.original.totalAssets);
  assert.equal(holding(simulated, 'A02').quantity, 500);
  assert.equal(holding(simulated, 'A02').marketValue, '25000.00');
  assert.equal(industry(simulated, '科技').allocationPercent, '55.00');
  assert.deepEqual(alertKeys(simulated), ['industry:科技']);
  assert.equal(changes.cash, '5000.00');
  assert.equal(changes.investedValue, '-5000.00');
  assert.equal(changes.totalAssets, '0.00');
  assert.equal(changes.holdings.find((item) => item.symbol === 'A02').marketValue, '5000.00');
  assert.equal(changes.industries.find((item) => item.industry === '科技').allocationPercent, '-5.00');
  assert.equal(changes.alerts.before.length, 2);
  assert.equal(changes.alerts.after.length, 1);
  assert.ok(Number(simulated.cash) >= 0);
  assert.ok(simulated.holdings.every((item) => item.quantity >= 0));
});

test('AC-04: invalid trades fail with code, status and one-based index; prior result stays intact', () => {
  const baseline = JSON.stringify(fixture);
  const confirmed = simulationService.simulate(fixture, snapshotId,
    [{ type: 'sell', symbol: 'A01', quantity: 100 }]);
  const confirmedBefore = JSON.stringify(confirmed);
  const cases = [
    [{ type: 'buy', symbol: 'A01', quantity: 201 }, 'INSUFFICIENT_CASH', 422],
    [{ type: 'sell', symbol: 'A01', quantity: 401 }, 'INSUFFICIENT_HOLDINGS', 422],
    ...[0, -1, 1.5, '1', null].map((quantity) =>
      [{ type: 'buy', symbol: 'A01', quantity }, 'INVALID_QUANTITY', 400]),
    [{ type: 'buy', symbol: 'UNKNOWN', quantity: 1 }, 'INVALID_SYMBOL', 400],
    [{ type: 'hold', symbol: 'A01', quantity: 1 }, 'INVALID_TYPE', 400],
  ];
  for (const [badTrade, code, status] of cases) {
    assert.throws(() => simulationService.simulate(fixture, snapshotId, [badTrade]),
      (error) => error instanceof SimulationError && error.code === code &&
      error.status === status && error.tradeIndex === 1 && Boolean(error.message));
    assert.equal(JSON.stringify(fixture), baseline);
    assert.equal(JSON.stringify(confirmed), confirmedBefore);
  }
  assert.throws(() => simulationService.simulate(fixture, snapshotId, [
    { type: 'sell', symbol: 'A01', quantity: 100 },
    { type: 'buy', symbol: 'A01', quantity: 301 },
  ]), (error) => error.code === 'INSUFFICIENT_CASH' && error.tradeIndex === 2);
  assert.equal(JSON.stringify(confirmed), confirmedBefore);
  assert.throws(() => simulationService.simulate(fixture, 'WRONG', []),
    (error) => error.code === 'INVALID_SNAPSHOT' && error.status === 400);
});

test('unrounded allocation controls threshold decisions', () => {
  const data = {
    ...fixture,
    cash: '69999.00',
    instruments: [{ ...fixture.instruments[0], price: '30001.00', quantity: 1 }],
  };
  const result = portfolioService.analyze(data);
  assert.equal(holding(result, 'A01').allocationPercent, '30.00');
  assert.deepEqual(alertKeys(result), ['instrument:A01']);
  assert.equal(result.alerts[0].threshold, '0.3');
});

test('empty sequence leaves original values unchanged', () => {
  const result = simulationService.simulate(fixture, snapshotId, []);
  assert.deepEqual(result.simulated, result.original);
  assert.equal(result.changes.totalAssets, '0.00');
  assert.ok(result.changes.holdings.every((item) => item.quantity === 0));
});
