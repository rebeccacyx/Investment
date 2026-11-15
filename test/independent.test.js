
const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./fixtures/portfolio.json');
const { SimulationService } = require('../src/services/SimulationService');
const { PortfolioService } = require('../src/services/PortfolioService');

const service = new SimulationService();
//T-01
test('T-01:交易顺序影响模拟结果', () => {
  // 情况 A：先卖后买，应成功
  const result = service.simulate(
    fixture,
    fixture.snapshot_id,
    [
      { type: 'sell', symbol: 'A01', quantity: 1 },
      { type: 'buy', symbol: 'A01', quantity: 201 }
    ]
  );

  assert.equal(result.simulated.cash, '0.00');

  const a01 = result.simulated.holdings
    .find(item => item.symbol === 'A01');

  assert.equal(a01.quantity, 600);
  assert.equal(result.simulated.totalAssets, '100000.00');

  // 情况 B：先买后卖，应失败
  assert.throws(() => {
    service.simulate(
      fixture,
      fixture.snapshot_id,
      [
        { type: 'buy', symbol: 'A01', quantity: 201 },
        { type: 'sell', symbol: 'A01', quantity: 1 }
      ]
    );
  }, error =>
    error.code === 'INSUFFICIENT_CASH' &&
    error.tradeIndex === 1
  );
});
test('T-02: 集中度判断使用未舍入的真实占比', () => {
  const portfolioService = new PortfolioService();

  // 情况 A：真实占比 29.999%
  const below = {
    ...fixture,
    cash: '70001.00',
    instruments: [
      {
        ...fixture.instruments[0],
        price: '29999.00',
        quantity: 1
      }
    ]
  };

  // 情况 B：真实占比 30.001%
  const above = {
    ...fixture,
    cash: '69999.00',
    instruments: [
      {
        ...fixture.instruments[0],
        price: '30001.00',
        quantity: 1
      }
    ]
  };

  const resultA = portfolioService.analyze(below);
  const resultB = portfolioService.analyze(above);

  // 展示结果相同
  assert.equal(resultA.holdings[0].allocationPercent, '30.00');
  assert.equal(resultB.holdings[0].allocationPercent, '30.00');

  // 真实值不同
  assert.equal(resultA.holdings[0].allocation, '0.29999');
  assert.equal(resultB.holdings[0].allocation, '0.30001');


  assert.equal(resultA.alerts.length, 0);
  assert.equal(resultB.alerts.length, 1);
  assert.equal(resultB.alerts[0].symbol, 'A01');
});
test('T-03: 第三笔失败不影响此前有效结果', () => {
  const validOperations = [
    { type: 'sell', symbol: 'A01', quantity: 100 },
    { type: 'buy', symbol: 'A02', quantity: 100 }
  ];

  const confirmed = service.simulate(
    fixture,
    fixture.snapshot_id,
    validOperations
  );

  // 确认 AC-03 的结果
  assert.equal(confirmed.simulated.cash, '25000.00');
  assert.equal(confirmed.simulated.totalAssets, '100000.00');
  assert.equal(
    confirmed.simulated.holdings.find(h => h.symbol === 'A01').quantity,
    300
  );
  assert.equal(
    confirmed.simulated.holdings.find(h => h.symbol === 'A02').quantity,
    500
  );

  // 记录此前有效状态
  const originalBefore = structuredClone(fixture);
  const confirmedBefore = structuredClone(confirmed);

  // 第三笔超量卖出
  assert.throws(
    () => service.simulate(
      fixture,
      fixture.snapshot_id,
      [
        ...validOperations,
        { type: 'sell', symbol: 'A01', quantity: 301 }
      ]
    ),
    error =>
      error.code === 'INSUFFICIENT_HOLDINGS' &&
      error.tradeIndex === 3
  );

  // 失败操作不得影响原始数据或此前确认的结果
  assert.deepEqual(fixture, originalBefore);
  assert.deepEqual(confirmed, confirmedBefore);
});