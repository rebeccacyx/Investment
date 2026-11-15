const { PortfolioService, Decimal } = require('./PortfolioService');

class SimulationError extends Error {
  constructor(code, message, status, tradeIndex) {
    super(message);
    this.name = 'SimulationError';
    this.code = code;
    this.status = status;
    if (tradeIndex !== undefined) this.tradeIndex = tradeIndex;
  }
}

const difference = (after, before) => new Decimal(after).minus(before).toFixed(2);
const ratioDifference = (after, before) => new Decimal(after).minus(before).toString();
const percentDifference = (after, before) => new Decimal(after).minus(before).times(100).toFixed(2);

class SimulationService {
  constructor(portfolioService = new PortfolioService()) {
    this.portfolioService = portfolioService;
  }

  simulate(portfolio, snapshotId, operations) {
    if (snapshotId !== portfolio.snapshot_id) {
      throw new SimulationError('INVALID_SNAPSHOT', '行情快照 ID 无效', 400);
    }
    if (!Array.isArray(operations)) {
      throw new SimulationError('INVALID_OPERATIONS', '交易序列必须为数组', 400);
    }
    //状态约束2.2
    const original = this.portfolioService.analyze(portfolio);
    const state = {
      ...portfolio,
      cash: portfolio.cash,
      instruments: portfolio.instruments.map((instrument) => ({ ...instrument })),
    };
    let cash = new Decimal(state.cash);
    const instruments = new Map(state.instruments.map((item) => [item.symbol, item]));

    operations.forEach((operation, index) => {
      const tradeIndex = index + 1;
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
        throw new SimulationError('INVALID_TRADE', '交易格式无效', 400, tradeIndex);
      }
      if (operation.type !== 'buy' && operation.type !== 'sell') {
        throw new SimulationError('INVALID_TYPE', '交易方向必须为 buy 或 sell', 400, tradeIndex);
      }
      const instrument = instruments.get(operation.symbol);
      if (!instrument) {
        throw new SimulationError('INVALID_SYMBOL', '交易标的不存在', 400, tradeIndex);
      }
      if (!Number.isSafeInteger(operation.quantity) || operation.quantity <= 0) {
        throw new SimulationError('INVALID_QUANTITY', '交易数量必须为正整数', 400, tradeIndex);
      }

      const quantity = operation.quantity;
      const amount = new Decimal(instrument.price).times(quantity);
      if (operation.type === 'buy') {
        if (cash.lt(amount)) {
          throw new SimulationError('INSUFFICIENT_CASH', '现金余额不足', 422, tradeIndex);
        }
        cash = cash.minus(amount);
        instrument.quantity += quantity;
      } else {
        if (instrument.quantity < quantity) {
          throw new SimulationError('INSUFFICIENT_HOLDINGS', '持仓数量不足', 422, tradeIndex);
        }
        cash = cash.plus(amount);
        instrument.quantity -= quantity;
      }
      state.cash = cash.toString();
    });

    const simulated = this.portfolioService.analyze(state);
    const beforeHoldings = new Map(original.holdings.map((item) => [item.symbol, item]));
    const beforeIndustries = new Map(original.industries.map((item) => [item.industry, item]));
    return {
      original,
      simulated,
      changes: {
        cash: difference(simulated.cash, original.cash),
        investedValue: difference(simulated.investedValue, original.investedValue),
        totalAssets: difference(simulated.totalAssets, original.totalAssets),
        holdings: simulated.holdings.map((item) => {
          const before = beforeHoldings.get(item.symbol);
          return {
            symbol: item.symbol,
            quantity: item.quantity - before.quantity,
            marketValue: difference(item.marketValue, before.marketValue),
            allocation: ratioDifference(item.allocation, before.allocation),
            allocationPercent: percentDifference(item.allocation, before.allocation),
          };
        }),
        industries: simulated.industries.map((item) => {
          const before = beforeIndustries.get(item.industry);
          return {
            industry: item.industry,
            marketValue: difference(item.marketValue, before.marketValue),
            allocation: ratioDifference(item.allocation, before.allocation),
            allocationPercent: percentDifference(item.allocation, before.allocation),
          };
        }),
        alerts: { before: original.alerts, after: simulated.alerts },
      },
    };
  }
}

module.exports = { SimulationService, SimulationError };
