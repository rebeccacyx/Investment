const express = require('express');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PortfolioService } = require('./services/PortfolioService');
const { SimulationService, SimulationError } = require('./services/SimulationService');
const { JsonStorage } = require('./storage/JsonStorage');

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function createApp({
  portfolioPath = path.join(__dirname, '../data/portfolio.json'),
  plansPath = path.join(__dirname, '../data/plans.json'),
  storage = new JsonStorage({ portfolioPath, plansPath }),
} = {}) {
  const app = express();
  const portfolioService = new PortfolioService();
  const simulationService = new SimulationService(portfolioService);
  app.use(express.json());

  app.get('/api/portfolio', async (req, res) => {
    const portfolio = await storage.readPortfolio();
    res.json(portfolioService.analyze(portfolio));
  });

  app.post('/api/simulations', async (req, res) => {
    const portfolio = await storage.readPortfolio();
    const { snapshot_id, operations } = req.body || {};
    res.json(simulationService.simulate(portfolio, snapshot_id, operations));
  });

  app.post('/api/plans', async (req, res) => {
    const { name, snapshot_id, operations } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      throw new ApiError('INVALID_NAME', '方案名称不能为空', 400);
    }
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new ApiError('EMPTY_PLAN', '方案至少需要一笔交易', 400);
    }
    const portfolio = await storage.readPortfolio();
    simulationService.simulate(portfolio, snapshot_id, operations);
    const plan = { id: randomUUID(), name: name.trim(), snapshot_id, operations };
    await storage.savePlan(plan);
    res.status(201).json({ id: plan.id });
  });

  app.get('/api/plans', async (req, res) => {
    const plans = await storage.listPlans();
    res.json({ plans: plans.map(({ id, name, snapshot_id }) => ({ id, name, snapshot_id })) });
  });

  app.get('/api/plans/:id', async (req, res) => {
    const plans = await storage.listPlans();
    const plan = plans.find((item) => item.id === req.params.id);
    if (!plan) throw new ApiError('PLAN_NOT_FOUND', '方案不存在', 404);
    const portfolio = await storage.readPortfolio();
    const result = simulationService.simulate(portfolio, plan.snapshot_id, plan.operations);
    res.json({ plan, result });
  });

  app.use((error, req, res, next) => {
    if (error instanceof ApiError || error instanceof SimulationError) {
      const payload = { code: error.code, message: error.message };
      if (error.tradeIndex !== undefined) payload.tradeIndex = error.tradeIndex;
      return res.status(error.status).json({ error: payload });
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求 JSON 格式无效' } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务端处理失败' } });
  });

  return app;
}

module.exports = { createApp };
