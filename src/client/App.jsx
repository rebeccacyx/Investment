import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const money = (value) => value == null ? '—' : `¥${value}`;
const percent = (value) => value == null ? '—' : `${value}%`;
const signed = (value, suffix = '') => value == null ? '—' : `${Number(value) > 0 ? '+' : ''}${value}${suffix}`;

function Alerts({ alerts }) {
  if (!alerts?.length) return <p className="quiet-state">当前无超限提醒</p>;
  return <ul className="alert-list">{alerts.map((alert) => (
    <li key={`${alert.type}:${alert.symbol || alert.industry}`} className="alert-item">
      <span className="alert-marker" aria-hidden="true">!</span>
      <span><strong>{alert.type === 'instrument' ? `${alert.symbol} · ${alert.name}` : `${alert.industry}行业`}</strong>
        <small>实际 {percent(alert.allocationPercent)} · 阈值 {percent(alert.thresholdPercent)}</small></span>
      <span className="alert-tag">超限</span>
    </li>
  ))}</ul>;
}

function OverviewDetails({ portfolio }) {
  return <div className="overview-detail">
    <div><div className="subheading"><h3>持仓明细</h3><span>固定价格</span></div>
      <div className="table-scroll"><table className="overview-table">
        <thead><tr><th scope="col">标的</th><th scope="col">行业</th><th scope="col" className="numeric">价格</th>
          <th scope="col" className="numeric">数量</th><th scope="col" className="numeric">市值</th><th scope="col" className="numeric">占比</th></tr></thead>
        <tbody>{portfolio.holdings.map((item) => <tr key={item.symbol}>
          <th scope="row"><span className="symbol">{item.symbol}</span><span className="instrument-name">{item.name}</span></th>
          <td>{item.industry}</td><td className="numeric">{money(item.price)}</td>
          <td className="numeric">{item.quantity}</td><td className="numeric">{money(item.marketValue)}</td>
          <td className="numeric">{percent(item.allocationPercent)}</td></tr>)}</tbody>
      </table></div>
    </div>
    <div><div className="subheading"><h3>行业分布</h3><span>现金不归入行业</span></div>
      <div className="table-scroll"><table className="overview-industry-table">
        <thead><tr><th scope="col">行业</th><th scope="col" className="numeric">市值</th><th scope="col" className="numeric">占比</th></tr></thead>
        <tbody>{portfolio.industries.map((item) => <tr key={item.industry}><th scope="row">{item.industry}</th>
          <td className="numeric">{money(item.marketValue)}</td><td className="numeric">{percent(item.allocationPercent)}</td></tr>)}</tbody>
      </table></div>
    </div>
  </div>;
}

function HoldingsTable({ before, after, changes }) {
  const changeMap = new Map(changes?.holdings?.map((item) => [item.symbol, item]) || []);
  const afterMap = new Map(after?.holdings?.map((item) => [item.symbol, item]) || []);
  return <div className="table-scroll"><table aria-label="持仓前后对比">
    <thead><tr><th scope="col">标的</th><th scope="col">行业</th>
      <th scope="col" className="numeric">原数量</th><th scope="col" className="numeric">模拟数量</th><th scope="col" className="numeric">变化</th>
      <th scope="col" className="numeric">原市值</th><th scope="col" className="numeric">模拟市值</th><th scope="col" className="numeric">变化</th>
      <th scope="col" className="numeric">原占比</th><th scope="col" className="numeric">模拟占比</th><th scope="col" className="numeric">变化</th>
    </tr></thead>
    <tbody>{before.holdings.map((item) => {
      const next = afterMap.get(item.symbol);
      const delta = changeMap.get(item.symbol);
      return <tr key={item.symbol}>
        <th scope="row"><span className="symbol">{item.symbol}</span><span className="instrument-name">{item.name}</span></th>
        <td>{item.industry}</td>
        <td className="numeric">{item.quantity}</td><td className="numeric">{next?.quantity ?? '—'}</td>
        <td className="numeric delta">{signed(delta?.quantity)}</td>
        <td className="numeric">{money(item.marketValue)}</td><td className="numeric">{money(next?.marketValue)}</td>
        <td className="numeric delta">{signed(delta?.marketValue)}</td>
        <td className="numeric">{percent(item.allocationPercent)}</td><td className="numeric">{percent(next?.allocationPercent)}</td>
        <td className="numeric delta">{signed(delta?.allocationPercent, '%')}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function IndustryTable({ before, after, changes }) {
  const afterMap = new Map(after?.industries?.map((item) => [item.industry, item]) || []);
  const changeMap = new Map(changes?.industries?.map((item) => [item.industry, item]) || []);
  return <div className="table-scroll"><table className="industry-table" aria-label="行业前后对比">
    <thead><tr><th scope="col">行业</th><th scope="col" className="numeric">原市值</th>
      <th scope="col" className="numeric">模拟市值</th><th scope="col" className="numeric">原占比</th>
      <th scope="col" className="numeric">模拟占比</th><th scope="col" className="numeric">占比变化</th></tr></thead>
    <tbody>{before.industries.map((item) => {
      const next = afterMap.get(item.industry);
      const delta = changeMap.get(item.industry);
      return <tr key={item.industry}><th scope="row">{item.industry}</th>
        <td className="numeric">{money(item.marketValue)}</td><td className="numeric">{money(next?.marketValue)}</td>
        <td className="numeric">{percent(item.allocationPercent)}</td><td className="numeric">{percent(next?.allocationPercent)}</td>
        <td className="numeric delta">{signed(delta?.allocationPercent, '%')}</td></tr>;
    })}</tbody>
  </table></div>;
}

export default function App() {
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [plansError, setPlansError] = useState('');
  const [plansLoading, setPlansLoading] = useState(true);
  const [operations, setOperations] = useState([]);
  const [simulation, setSimulation] = useState(null);
  const [viewedPlan, setViewedPlan] = useState(null);
  const [direction, setDirection] = useState('buy');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [tradeError, setTradeError] = useState('');
  const [tradePending, setTradePending] = useState(false);
  const [planName, setPlanName] = useState('');
  const [savePending, setSavePending] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [openPendingId, setOpenPendingId] = useState(null);
  const [openError, setOpenError] = useState('');

  async function loadOverview() {
    setOverviewLoading(true);
    setOverviewError('');
    try {
      const data = await api.portfolio();
      setOverview(data);
      setSymbol((current) => current || data.holdings[0]?.symbol || '');
    } catch (error) {
      setOverviewError(error.message);
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadPlans() {
    setPlansLoading(true);
    setPlansError('');
    try {
      setPlans((await api.listPlans()).plans);
    } catch (error) {
      setPlansError(error.message);
    } finally {
      setPlansLoading(false);
    }
  }

  useEffect(() => { loadOverview(); loadPlans(); }, []);

  async function addTrade(event) {
    event.preventDefault();
    if (!overview || viewedPlan || tradePending) return;
    if (!/^[1-9]\d*$/.test(quantity) || !Number.isSafeInteger(Number(quantity))) {
      setTradeError('交易数量必须为正整数。');
      return;
    }
    const candidate = [...operations, { type: direction, symbol, quantity: Number(quantity) }];
    setTradePending(true);
    setTradeError('');
    try {
      const result = await api.simulate(overview.snapshotId, candidate);
      setOperations(candidate);
      setSimulation(result);
      setQuantity('');
      setSaveMessage('');
    } catch (error) {
      setTradeError(error.message);
    } finally {
      setTradePending(false);
    }
  }

  async function savePlan(event) {
    event.preventDefault();
    if (!overview || viewedPlan || savePending || !operations.length) return;
    if (!planName.trim()) {
      setSaveMessage('请输入方案名称。');
      return;
    }
    setSavePending(true);
    setSaveMessage('');
    try {
      const saved = await api.savePlan(planName.trim(), overview.snapshotId, operations);
      setSaveMessage(`保存成功 · ID ${saved.id}`);
      setPlanName('');
      await loadPlans();
    } catch (error) {
      setSaveMessage(error.message);
    } finally {
      setSavePending(false);
    }
  }

  async function openPlan(id) {
    if (openPendingId) return;
    setOpenPendingId(id);
    setOpenError('');
    try {
      setViewedPlan(await api.openPlan(id));
    } catch (error) {
      setOpenError(error.message);
    } finally {
      setOpenPendingId(null);
    }
  }

  const result = viewedPlan?.result || simulation;
  const before = result?.original || overview;
  const after = result?.simulated || null;
  const changes = result?.changes || null;
  const visibleOperations = viewedPlan?.plan.operations || operations;
  const currentAlerts = after?.alerts ?? overview?.alerts;
  const alertSource = viewedPlan ? '已保存方案' : after ? '当前模拟' : '原始组合';

  return <div className="app-shell">
    <header className="masthead"><div className="masthead-inner">
      <div><div className="eyebrow">PORTFOLIO WORKSPACE <span className="eyebrow-line" /></div>
        <h1>投资组合调仓工作台</h1><p>基于固定行情快照，查看资产结构与模拟调仓结果。</p></div>
      <div className="header-pill">CNY · 模拟分析</div>
    </div></header>
    <main className="workspace">
      <section className="panel overview" aria-labelledby="overview-title">
        <div className="section-heading"><div><p className="section-kicker">01 / PORTFOLIO OVERVIEW</p><h2 id="overview-title">组合概览</h2></div>
          {overview && <span className="snapshot">快照：{overview.snapshotAt}</span>}</div>
        {overviewLoading && <p role="status" className="quiet-state">正在加载组合…</p>}
        {overviewError && <div className="feedback error" role="alert">{overviewError} <button type="button" onClick={loadOverview}>重试</button></div>}
        {overview && <div className="summary-grid">
            <div className="summary-card primary"><span>总资产</span><strong>{money(overview.totalAssets)}</strong><small>{overview.portfolioId} · {overview.name}</small></div>
            <div className="summary-card"><span>现金余额</span><strong>{money(overview.cash)}</strong><small>计入总资产</small></div>
            <div className="summary-card"><span>持仓市值</span><strong>{money(overview.investedValue)}</strong><small>{overview.holdings.length} 个标的</small></div>
          </div>}
        {currentAlerts && <div className="overview-alerts" role="region" aria-label="集中度提醒">
          <div className="subheading"><h3>集中度提醒</h3><span>{alertSource}</span></div>
          <Alerts alerts={currentAlerts} />
        </div>}
        {overview && <OverviewDetails portfolio={overview} />}
      </section>

      <div className="simulation-section">
        <section className="panel trade-panel" aria-labelledby="trade-title">
          <div className="section-heading"><div><p className="section-kicker">02 / TRADE SIMULATION</p><h2 id="trade-title">调仓模拟</h2></div>
            {viewedPlan && <span className="readonly-badge">只读方案</span>}</div>
          {viewedPlan && <div className="feedback info">正在查看「{viewedPlan.plan.name}」 · ID {viewedPlan.plan.id}
            <button type="button" onClick={() => setViewedPlan(null)}>返回当前模拟</button></div>}
          {!viewedPlan && <form className="trade-form" onSubmit={addTrade} noValidate>
            <label>交易方向<select value={direction} onChange={(event) => setDirection(event.target.value)} disabled={!overview || tradePending}>
              <option value="buy">BUY · 买入</option><option value="sell">SELL · 卖出</option></select></label>
            <label>交易标的<select value={symbol} onChange={(event) => setSymbol(event.target.value)} disabled={!overview || tradePending}>
              {overview?.holdings.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>)}</select></label>
            <label>数量<input type="number" min="1" step="1" inputMode="numeric" value={quantity}
              onChange={(event) => setQuantity(event.target.value)} placeholder="输入正整数" disabled={!overview || tradePending} /></label>
            <button className="button primary-button" type="submit" disabled={!overview || tradePending}>{tradePending ? '正在验证…' : '添加交易'}</button>
          </form>}
          {tradeError && !viewedPlan && <p className="feedback error" role="alert">{tradeError}</p>}
          <div className="subheading operations-heading"><h3>{viewedPlan ? '已保存交易' : '已确认交易'}</h3><span>{visibleOperations.length} 笔</span></div>
          {visibleOperations.length === 0 ? <p className="quiet-state empty-trades">尚无交易。添加交易后将在下方显示调仓前后对比。</p> :
            <ol className="operation-list">{visibleOperations.map((item, index) => <li key={`${index}-${item.symbol}-${item.type}`}>
              <span className="operation-number">{String(index + 1).padStart(2, '0')}</span>
              <span className={`direction ${item.type}`}>{item.type === 'buy' ? '买入' : '卖出'}</span>
              <strong>{item.symbol}</strong><span>数量 {item.quantity}</span></li>)}</ol>}
        </section>

      </div>

      {before && <section className="panel comparison" aria-labelledby="comparison-title">
        <div className="section-heading"><div><p className="section-kicker">03 / BEFORE & AFTER</p><h2 id="comparison-title">调仓前后对比</h2></div>
          <span className={`result-status ${after ? 'ready' : ''}`}>{after ? (viewedPlan ? '已保存方案结果' : '模拟结果') : '待添加交易'}</span></div>
        {!after && <p className="quiet-state comparison-empty">当前显示原始组合。添加交易后，模拟数量、市值、占比及变化量将由后端返回。</p>}
        <div className="subheading"><h3>持仓明细</h3><span>原始 / 模拟 / 变化</span></div>
        <HoldingsTable before={before} after={after} changes={changes} />
        <div className="subheading cash-heading"><h3>现金与总资产</h3></div>
        <div className="table-scroll"><table className="cash-table" aria-label="现金与总资产对比">
          <thead><tr><th scope="col">项目</th><th scope="col" className="numeric">原始</th>
            <th scope="col" className="numeric">模拟</th><th scope="col" className="numeric">变化</th></tr></thead>
          <tbody><tr><th scope="row">现金余额</th><td className="numeric">{money(before.cash)}</td>
            <td className="numeric">{money(after?.cash)}</td><td className="numeric delta">{signed(changes?.cash)}</td></tr>
          <tr><th scope="row">总资产</th><td className="numeric">{money(before.totalAssets)}</td>
            <td className="numeric">{money(after?.totalAssets)}</td><td className="numeric delta">{signed(changes?.totalAssets)}</td></tr></tbody>
        </table></div>
        <div className="subheading industry-heading"><h3>行业分布</h3><span>现金不归入行业</span></div>
        <IndustryTable before={before} after={after} changes={changes} />
      </section>}
      <section className="panel plans-panel" aria-labelledby="plans-title">
        <div className="section-heading"><div><p className="section-kicker">04 / SAVED PLANS</p><h2 id="plans-title">方案管理</h2></div></div>
        <form className="save-form" onSubmit={savePlan}>
          <label>方案名称<input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="输入方案名称"
            disabled={Boolean(viewedPlan) || savePending} /></label>
          <button className="button secondary-button" type="submit" disabled={!operations.length || Boolean(viewedPlan) || savePending}>
            {savePending ? '保存中…' : '保存当前方案'}</button>
        </form>
        {!operations.length && !viewedPlan && <p className="hint">完成至少一笔有效交易后可保存方案。</p>}
        {saveMessage && <p className={`feedback ${saveMessage.startsWith('保存成功') ? 'success' : 'error'}`} role="status">{saveMessage}</p>}
        <div className="subheading saved-heading"><h3>已保存方案</h3><span>{plans.length} 个</span></div>
        {plansLoading && <p role="status" className="quiet-state">正在加载方案…</p>}
        {plansError && <div className="feedback error" role="alert">{plansError} <button type="button" onClick={loadPlans}>重试</button></div>}
        {openError && <p className="feedback error" role="alert">{openError}</p>}
        {!plansLoading && !plansError && plans.length === 0 && <p className="quiet-state">暂无已保存方案。</p>}
        {plans.length > 0 && <ul className="plan-list">{plans.map((plan) => <li key={plan.id}>
          <div><strong>{plan.name}</strong><small>ID {plan.id}</small></div>
          <button type="button" className="text-button" onClick={() => openPlan(plan.id)} disabled={Boolean(openPendingId)}>
            {openPendingId === plan.id ? '打开中…' : '打开'}</button></li>)}</ul>}
      </section>
    </main>
    <footer className="footer">固定行情快照 · 仅用于调仓模拟</footer>
  </div>;
}
