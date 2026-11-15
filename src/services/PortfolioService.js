const Decimal = require('decimal.js').clone({ precision: 40 });

const money = (value) => value.toFixed(2);
const ratio = (value, total) => total.isZero() ? '0' : value.div(total).toString();
const percent = (value, total) => total.isZero() ? '0.00' : value.div(total).times(100).toFixed(2);

class PortfolioService {
  analyze(portfolio) {
    const cash = new Decimal(portfolio.cash);
    const positions = portfolio.instruments.map((instrument) => ({
      ...instrument,
      marketValue: new Decimal(instrument.price).times(instrument.quantity),
    }));
    const invested = positions.reduce((sum, item) => sum.plus(item.marketValue), new Decimal(0));
    const total = cash.plus(invested);
    const singleThreshold = new Decimal(portfolio.rules.single_instrument_threshold);
    const industryThreshold = new Decimal(portfolio.rules.industry_threshold);
    const industryValues = new Map();

    for (const item of positions) {
      industryValues.set(item.industry,
        (industryValues.get(item.industry) || new Decimal(0)).plus(item.marketValue));
    }

    const holdings = positions.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      industry: item.industry,
      price: money(new Decimal(item.price)),
      quantity: item.quantity,
      marketValue: money(item.marketValue),
      allocation: ratio(item.marketValue, total),
      allocationPercent: percent(item.marketValue, total),
    }));
    const industries = [...industryValues].map(([industry, value]) => ({
      industry,
      marketValue: money(value),
      allocation: ratio(value, total),
      allocationPercent: percent(value, total),
    }));
    //比较阈值
    const alerts = [
      ...positions.filter((item) => item.marketValue.gt(total.times(singleThreshold))).map((item) => ({
        type: 'instrument',
        symbol: item.symbol,
        name: item.name,
        allocation: ratio(item.marketValue, total),
        allocationPercent: percent(item.marketValue, total),
        threshold: singleThreshold.toString(),
        thresholdPercent: singleThreshold.times(100).toFixed(2),
      })),
      ...[...industryValues].filter(([, value]) => value.gt(total.times(industryThreshold)))
        .map(([industry, value]) => ({
          type: 'industry',
          industry,
          allocation: ratio(value, total),
          allocationPercent: percent(value, total),
          threshold: industryThreshold.toString(),
          thresholdPercent: industryThreshold.times(100).toFixed(2),
        })),
    ];

    return {
      portfolioId: portfolio.portfolio_id,
      name: portfolio.name,
      currency: portfolio.currency,
      snapshotId: portfolio.snapshot_id,
      snapshotAt: portfolio.snapshot_at,
      cash: money(cash),
      investedValue: money(invested),
      totalAssets: money(total),
      holdings,
      industries,
      alerts,
    };
  }
}

module.exports = { PortfolioService, Decimal };
