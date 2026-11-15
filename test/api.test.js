const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

const fixturePath = path.join(__dirname, 'fixtures/portfolio.json');
const operations = [
  { type: 'sell', symbol: 'A01', quantity: 100 },
  { type: 'buy', symbol: 'A02', quantity: 100 },
];

async function startServer(options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
  };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function request(base, route, body) {
  const response = await fetch(`${base}${route}`, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test('AC-05: five APIs, saved plan recovery after restart, duplicate names and source isolation', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-api-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const portfolioPath = path.join(dir, 'portfolio.json');
  const plansPath = path.join(dir, 'plans.json');
  await fs.copyFile(fixturePath, portfolioPath);
  const sourceBefore = await fs.readFile(portfolioPath, 'utf8');
  const first = await startServer({ portfolioPath, plansPath });
  t.after(async () => { if (first.server.listening) await stopServer(first.server); });

  const overview = await request(first.base, '/api/portfolio');
  assert.equal(overview.status, 200);
  assert.equal(overview.data.cash, '20000.00');
  assert.equal(overview.data.totalAssets, '100000.00');

  const simulation = await request(first.base, '/api/simulations', {
    snapshot_id: 'SNAP-20261102', operations,
  });
  assert.equal(simulation.status, 200);
  assert.equal(simulation.data.simulated.cash, '25000.00');
  assert.equal(simulation.data.simulated.totalAssets, '100000.00');

  const saveBody = { name: 'AC-03 方案', snapshot_id: 'SNAP-20261102', operations };
  const saved = await request(first.base, '/api/plans', saveBody);
  assert.equal(saved.status, 201);
  assert.match(saved.data.id, /^[0-9a-f-]{36}$/);
  const secondSaved = await request(first.base, '/api/plans', saveBody);
  assert.equal(secondSaved.status, 201);
  assert.notEqual(secondSaved.data.id, saved.data.id);

  const filePlans = JSON.parse(await fs.readFile(plansPath, 'utf8'));
  assert.equal(filePlans.length, 2);
  assert.deepEqual(Object.keys(filePlans[0]), ['id', 'name', 'snapshot_id', 'operations']);
  assert.deepEqual(filePlans[0].operations, operations);
  assert.deepEqual(filePlans[1].operations, operations);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['plans.json', 'portfolio.json']);

  const list = await request(first.base, '/api/plans');
  assert.equal(list.status, 200);
  assert.equal(list.data.plans.length, 2);
  assert.equal(list.data.plans[0].name, list.data.plans[1].name);
  assert.equal(list.data.plans[0].id, saved.data.id);

  await stopServer(first.server);
  const reopenedServer = await startServer({ portfolioPath, plansPath });
  t.after(async () => { if (reopenedServer.server.listening) await stopServer(reopenedServer.server); });
  const reopened = await request(reopenedServer.base, `/api/plans/${saved.data.id}`);
  assert.equal(reopened.status, 200);
  assert.deepEqual(reopened.data.plan, filePlans[0]);
  assert.deepEqual(reopened.data.result, simulation.data);
  assert.equal(reopened.data.result.original.cash, '20000.00');
  assert.equal(reopened.data.result.original.holdings.find((item) => item.symbol === 'A01').quantity, 400);
  assert.equal(reopened.data.result.original.holdings.find((item) => item.symbol === 'A02').quantity, 400);
  assert.equal(await fs.readFile(portfolioPath, 'utf8'), sourceBefore);
});

test('API errors: invalid input, constraints, missing plan and failed write', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-errors-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const portfolioPath = path.join(dir, 'portfolio.json');
  const plansPath = path.join(dir, 'plans.json');
  await fs.copyFile(fixturePath, portfolioPath);
  const { server, base } = await startServer({ portfolioPath, plansPath });
  t.after(() => stopServer(server));

  const errors = [
    ['/api/plans', { name: '', snapshot_id: 'SNAP-20261102', operations }, 400, 'INVALID_NAME'],
    ['/api/plans', { name: '空方案', snapshot_id: 'SNAP-20261102', operations: [] }, 400, 'EMPTY_PLAN'],
    ['/api/plans', { name: '无效', snapshot_id: 'SNAP-20261102', operations: [
      { type: 'buy', symbol: 'A01', quantity: 201 },
    ] }, 422, 'INSUFFICIENT_CASH'],
    ['/api/simulations', { snapshot_id: 'WRONG', operations: [] }, 400, 'INVALID_SNAPSHOT'],
    ['/api/simulations', { snapshot_id: 'SNAP-20261102', operations: [
      { type: 'buy', symbol: 'A01', quantity: 0 },
    ] }, 400, 'INVALID_QUANTITY'],
  ];
  for (const [route, body, status, code] of errors) {
    const result = await request(base, route, body);
    assert.equal(result.status, status);
    assert.equal(result.data.error.code, code);
    assert.ok(result.data.error.message);
  }
  const invalidTrade = await request(base, '/api/simulations', {
    snapshot_id: 'SNAP-20261102', operations: [
      { type: 'sell', symbol: 'A01', quantity: 100 },
      { type: 'sell', symbol: 'A01', quantity: 301 },
    ],
  });
  assert.equal(invalidTrade.status, 422);
  assert.equal(invalidTrade.data.error.tradeIndex, 2);
  const missing = await request(base, '/api/plans/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error.code, 'PLAN_NOT_FOUND');
  const malformed = await fetch(`${base}/api/simulations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{broken',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  await assert.rejects(fs.access(plansPath));

  const failing = await startServer({
    portfolioPath,
    plansPath: path.join(dir, 'missing-directory', 'plans.json'),
  });
  t.after(() => stopServer(failing.server));
  const failedSave = await request(failing.base, '/api/plans', {
    name: '无法写入', snapshot_id: 'SNAP-20261102', operations,
  });
  assert.equal(failedSave.status, 500);
  assert.equal(failedSave.data.error.code, 'INTERNAL_ERROR');
  assert.equal(failedSave.data.id, undefined);
});
