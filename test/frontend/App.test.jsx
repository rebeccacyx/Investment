import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/client/App.jsx';
import { api } from '../../src/client/api.js';

vi.mock('../../src/client/api.js', () => ({
  api: {
    portfolio: vi.fn(), simulate: vi.fn(), listPlans: vi.fn(), savePlan: vi.fn(), openPlan: vi.fn(),
  },
}));

const overview = {
  portfolioId: 'DEMO-001', name: '演示组合', currency: 'CNY',
  snapshotId: 'SNAP-20261102', snapshotAt: '2026-11-02T15:00:00+08:00',
  cash: '20000.00', investedValue: '80000.00', totalAssets: '100000.00',
  holdings: [
    { symbol: 'A01', name: '星河科技', industry: '科技', quantity: 400, marketValue: '40000.00', allocationPercent: '40.00' },
    { symbol: 'A02', name: '云帆软件', industry: '科技', quantity: 400, marketValue: '20000.00', allocationPercent: '20.00' },
  ],
  industries: [{ industry: '科技', marketValue: '60000.00', allocationPercent: '60.00' }],
  alerts: [
    { type: 'instrument', symbol: 'A01', name: '星河科技', allocationPercent: '40.00', thresholdPercent: '30.00' },
    { type: 'industry', industry: '科技', allocationPercent: '60.00', thresholdPercent: '50.00' },
  ],
};
const firstTrade = { type: 'sell', symbol: 'A01', quantity: 100 };
const simulated = {
  ...overview,
  cash: '30000.00', investedValue: '70000.00',
  holdings: [
    { ...overview.holdings[0], quantity: 300, marketValue: '30000.00', allocationPercent: '30.00' },
    overview.holdings[1],
  ],
  industries: [{ industry: '科技', marketValue: '50000.00', allocationPercent: '50.00' }],
  alerts: [],
};
const result = {
  original: overview, simulated,
  changes: {
    cash: '10000.00', totalAssets: '0.00',
    holdings: [
      { symbol: 'A01', quantity: -100, marketValue: '-10000.00', allocationPercent: '-10.00' },
      { symbol: 'A02', quantity: 0, marketValue: '0.00', allocationPercent: '0.00' },
    ],
    industries: [{ industry: '科技', allocationPercent: '-10.00' }],
  },
};
const resultAc03 = {
  original: overview,
  simulated: {
    ...simulated,
    cash: '25000.00',
    investedValue: '75000.00',
    holdings: [
      simulated.holdings[0],
      { ...simulated.holdings[1], quantity: 500, marketValue: '25000.00', allocationPercent: '25.00' },
    ],
    industries: [{ industry: '科技', marketValue: '55000.00', allocationPercent: '55.00' }],
    alerts: [{ type: 'industry', industry: '科技', allocationPercent: '55.00', thresholdPercent: '50.00' }],
  },
  changes: {
    ...result.changes,
    cash: '5000.00',
    holdings: [result.changes.holdings[0],
      { symbol: 'A02', quantity: 100, marketValue: '5000.00', allocationPercent: '5.00' }],
    industries: [{ industry: '科技', allocationPercent: '-5.00' }],
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  api.portfolio.mockResolvedValue(overview);
  api.listPlans.mockResolvedValue({ plans: [] });
  api.simulate.mockResolvedValue(result);
});

async function addFirstTrade(user) {
  await screen.findByText('DEMO-001 · 演示组合');
  await user.selectOptions(screen.getByLabelText('交易方向'), 'sell');
  await user.type(screen.getByLabelText('数量'), '100');
  await user.click(screen.getByRole('button', { name: '添加交易' }));
  await screen.findByText('1 笔');
}

describe('front-end state flow', () => {
  it('AC-01: shows only original alerts before simulation; saving is disabled', async () => {
    render(<App />);
    expect(await screen.findByText('DEMO-001 · 演示组合')).toBeTruthy();
    expect(screen.getByText('尚无交易。添加交易后将在下方显示调仓前后对比。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存当前方案' }).disabled).toBe(true);
    expect(screen.getAllByText('40.00%').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: '集中度提醒' })).toHaveLength(1);
    expect(screen.getAllByText('超限')).toHaveLength(2);
    expect(screen.getByText('原始组合')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '组合概览' }))
      .getByRole('region', { name: '集中度提醒' })).toBeTruthy();
    expect(api.portfolio).toHaveBeenCalledOnce();
    expect(api.simulate).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity before submitting a candidate sequence', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('DEMO-001 · 演示组合');
    await user.type(screen.getByLabelText('数量'), '0');
    await user.click(screen.getByRole('button', { name: '添加交易' }));
    expect(await screen.findByText('交易数量必须为正整数。')).toBeTruthy();
    expect(api.simulate).not.toHaveBeenCalled();
    expect(screen.getByText('尚无交易。添加交易后将在下方显示调仓前后对比。')).toBeTruthy();
  });

  it('submits the complete candidate sequence and retains confirmed result after rejection', async () => {
    const user = userEvent.setup();
    api.simulate.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('现金余额不足（第 2 笔交易）'));
    render(<App />);
    await addFirstTrade(user);
    expect(api.simulate).toHaveBeenNthCalledWith(1, overview.snapshotId, [firstTrade]);
    expect(screen.getAllByText('¥30000.00').length).toBeGreaterThan(0);
    expect(screen.getByText('当前无超限提醒')).toBeTruthy();
    expect(screen.queryByText('超限')).toBeNull();
    expect(screen.getByText('当前模拟')).toBeTruthy();
    const cashHeaders = within(screen.getByRole('table', { name: '现金与总资产对比' }))
      .getAllByRole('columnheader').map((element) => element.textContent);
    expect(cashHeaders).toEqual(['项目', '原始', '模拟', '变化']);
    const cashCells = within(screen.getByRole('table', { name: '现金与总资产对比' }))
      .getByRole('row', { name: /现金余额/ }).querySelectorAll('th, td');
    expect([...cashCells].map((element) => element.textContent))
      .toEqual(['现金余额', '¥20000.00', '¥30000.00', '+10000.00']);
    const holdingRow = within(screen.getByRole('table', { name: '持仓前后对比' }))
      .getByRole('row', { name: /A01/ });
    expect(holdingRow.textContent).toContain('400');
    expect(holdingRow.textContent).toContain('300');
    expect(holdingRow.textContent).toContain('-100');

    await user.selectOptions(screen.getByLabelText('交易方向'), 'buy');
    await user.selectOptions(screen.getByLabelText('交易标的'), 'A02');
    await user.type(screen.getByLabelText('数量'), '100');
    await user.click(screen.getByRole('button', { name: '添加交易' }));
    expect(await screen.findByText('现金余额不足（第 2 笔交易）')).toBeTruthy();
    expect(api.simulate).toHaveBeenNthCalledWith(2, overview.snapshotId, [
      firstTrade, { type: 'buy', symbol: 'A02', quantity: 100 },
    ]);
    expect(screen.getByText('1 笔')).toBeTruthy();
    expect(screen.getAllByText('¥30000.00').length).toBeGreaterThan(0);
    expect(screen.getByText('当前无超限提醒')).toBeTruthy();
  });

  it('AC-02 → AC-03: switches from no alerts to the simulated industry alert', async () => {
    const user = userEvent.setup();
    api.simulate.mockResolvedValueOnce(result).mockResolvedValueOnce(resultAc03);
    render(<App />);
    await addFirstTrade(user);
    expect(screen.getByText('当前无超限提醒')).toBeTruthy();
    expect(screen.queryByText('超限')).toBeNull();

    await user.selectOptions(screen.getByLabelText('交易方向'), 'buy');
    await user.selectOptions(screen.getByLabelText('交易标的'), 'A02');
    await user.type(screen.getByLabelText('数量'), '100');
    await user.click(screen.getByRole('button', { name: '添加交易' }));
    await screen.findByText('2 笔');
    expect(screen.getAllByRole('heading', { name: '集中度提醒' })).toHaveLength(1);
    expect(screen.getAllByText('超限')).toHaveLength(1);
    expect(screen.getByText('科技行业')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '集中度提醒' })).queryByText('A01 · 星河科技')).toBeNull();
    expect(screen.getByText('当前模拟')).toBeTruthy();
    expect(api.simulate).toHaveBeenNthCalledWith(2, overview.snapshotId, [
      firstTrade, { type: 'buy', symbol: 'A02', quantity: 100 },
    ]);
    expect(screen.getAllByText('¥25000.00').length).toBeGreaterThan(0);
    const industryRow = within(screen.getByRole('table', { name: '行业前后对比' }))
      .getByRole('row', { name: /科技/ });
    expect(industryRow.textContent).toContain('60.00%');
    expect(industryRow.textContent).toContain('55.00%');
    expect(industryRow.textContent).toContain('-5.00%');
  });

  it('refreshes duplicate-name plans and opens a read-only recalculated result', async () => {
    const user = userEvent.setup();
    const plans = [
      { id: 'plan-1', name: '调仓方案', snapshot_id: overview.snapshotId },
      { id: 'plan-2', name: '调仓方案', snapshot_id: overview.snapshotId },
    ];
    api.savePlan.mockResolvedValue({ id: 'plan-2' });
    api.listPlans.mockResolvedValueOnce({ plans: [] }).mockResolvedValueOnce({ plans });
    api.openPlan.mockResolvedValue({
      plan: { ...plans[0], operations: [firstTrade, { type: 'buy', symbol: 'A02', quantity: 100 }] },
      result: resultAc03,
    });
    render(<App />);
    await addFirstTrade(user);
    await user.type(screen.getByLabelText('方案名称'), '调仓方案');
    await user.click(screen.getByRole('button', { name: '保存当前方案' }));
    await screen.findByText('保存成功 · ID plan-2');
    expect(api.savePlan).toHaveBeenCalledWith('调仓方案', overview.snapshotId, [firstTrade]);
    await waitFor(() => expect(screen.getAllByText('调仓方案')).toHaveLength(2));
    expect(screen.getByText('ID plan-1')).toBeTruthy();
    expect(screen.getByText('ID plan-2')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: '打开' })[0]);
    expect(await screen.findByText('只读方案')).toBeTruthy();
    expect(api.openPlan).toHaveBeenCalledWith('plan-1');
    expect(screen.queryByRole('button', { name: '添加交易' })).toBeNull();
    expect(screen.getByRole('button', { name: '保存当前方案' }).disabled).toBe(true);
    expect(within(screen.getByRole('region', { name: '集中度提醒' })).getByText('已保存方案')).toBeTruthy();
    expect(screen.getAllByText('超限')).toHaveLength(1);
    expect(screen.getByText('科技行业')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '返回当前模拟' }));
    expect(screen.getByRole('button', { name: '添加交易' })).toBeTruthy();
    expect(screen.getByText('1 笔')).toBeTruthy();
    expect(screen.getByText('当前无超限提醒')).toBeTruthy();
  });

  it('reports overview and missing-plan failures with retry or stable current state', async () => {
    const user = userEvent.setup();
    api.portfolio.mockRejectedValueOnce(new Error('无法连接后端服务')).mockResolvedValueOnce(overview);
    api.listPlans.mockResolvedValue({ plans: [{ id: 'missing', name: '旧方案', snapshot_id: overview.snapshotId }] });
    api.openPlan.mockRejectedValue(new Error('方案不存在'));
    render(<App />);
    expect(await screen.findByText('无法连接后端服务')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByText('DEMO-001 · 演示组合');
    await user.click(screen.getByRole('button', { name: '打开' }));
    expect(await screen.findByText('方案不存在')).toBeTruthy();
    expect(screen.getByRole('button', { name: '添加交易' })).toBeTruthy();
  });
});
