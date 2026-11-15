import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const money = (value) => value == null ? '—' : `¥${value}`;
const percent = (value) => value == null ? '—' : `${value}%`;
const signed = (value, suffix = '') => value == null ? '—' : `${Number(value) > 0 ? '+' : ''}${value}${suffix}`;
const snapshotTime = (value) => {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year} 年 ${Number(parts.month)} 月 ${Number(parts.day)} 日 ${parts.hour}:${parts.minute}`;
};

function Alerts({ alerts }) {
  if (!alerts?.length) return <p className="quiet-state">当前无超限提醒</p>;
  return <ul className="alert-list">{alerts.map((alert) => (
    <li key={`${alert.type}:${alert.symbol || alert.industry}`} className="alert-item">
      <span className="alert-marker" aria-hidden="true">!</span>
      <span><strong>{alert.type === 'instrument' ? `${alert.symbol} · ${alert.name}` : `${alert.industry}行业`}</strong>
        <small>投资占比 {percent(alert.allocationPercent)}，超过 {percent(alert.thresholdPercent)} 的提醒线。</small></span>
      <span className="alert-tag">超限</span>
    </li>
  ))}</ul>;
}

function OverviewDetails({ portfolio }) {
  return <div className="overview-detail">
    <div><div className="subheading"><h3>持仓明细</h3></div>
      <div className="table-scroll"><table className="overview-table" aria-label="当前持仓">
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
      <div className="table-scroll"><table className="overview-industry-table" aria-label="当前行业分布">
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
      <th scope="col" className="numeric">原始数量</th><th scope="col" className="numeric">模拟后数量</th><th scope="col" className="numeric">变化</th>
      <th scope="col" className="numeric">原始市值</th><th scope="col" className="numeric">模拟后市值</th><th scope="col" className="numeric">变化</th>
      <th scope="col" className="numeric">原始占比</th><th scope="col" className="numeric">模拟后占比</th><th scope="col" className="numeric">变化</th>
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
    <thead><tr><th scope="col">行业</th><th scope="col" className="numeric">原始市值</th>
      <th scope="col" className="numeric">模拟后市值</th><th scope="col" className="numeric">原始占比</th>
      <th scope="col" className="numeric">模拟后占比</th><th scope="col" className="numeric">占比变化</th></tr></thead>
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
    const numericQuantity = Number(quantity);
    if (quantity.trim() && Number.isFinite(numericQuantity) && numericQuantity <= 0) {
      setTradeError('数量必须为大于0。');
      return;
    }
    if (!/^\d+$/.test(quantity) || !Number.isSafeInteger(numericQuantity)) {
      setTradeError('请输入整数。');
      return;
    }
    const candidate = [...operations, { type: direction, symbol, quantity: numericQuantity }];
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
      await api.savePlan(planName.trim(), overview.snapshotId, operations);
      setSaveMessage('方案已保存。');
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

  function resetSimulation() {
    setViewedPlan(null);
    setOperations([]);
    setSimulation(null);
    setTradeError('');
    setDirection('buy');
    setSymbol(overview?.holdings[0]?.symbol || '');
    setQuantity('');
    setPlanName('');
    setSaveMessage('');
    setOpenError('');
  }

  const result = viewedPlan?.result || simulation;
  const before = result?.original || overview;
  const after = result?.simulated || null;
  const changes = result?.changes || null;
  const visibleOperations = viewedPlan?.plan.operations || operations;
  const visibleAlerts = after ? after.alerts : overview?.alerts;
  const alertSource = viewedPlan ? '已保存方案的模拟结果' : after ? '当前模拟结果' : '原始组合';

  return <div className="app-shell">
    <header className="masthead"><div className="masthead-inner">
      <div><div className="eyebrow">投资组合分析 <span className="eyebrow-line" /></div>
        <h1>投资组合调仓工作台</h1><p>使用固定价格模拟，非实时行情。</p></div>
      <div className="header-pill">人民币 · 模拟分析</div>
    </div></header>
    <main className="workspace">
      <section className="panel overview" aria-labelledby="overview-title">
        <div className="section-heading"><div><p className="section-kicker">01 / 当前组合</p><h2 id="overview-title">组合概览</h2></div>
          {overview && <div className="overview-meta"><span className="result-status ready">原始组合</span><span className="snapshot">模拟价格基准：{snapshotTime(overview.snapshotAt)}</span></div>}</div>
        {overviewLoading && <p role="status" className="quiet-state">正在加载组合…</p>}
        {overviewError && <div className="feedback error" role="alert">{overviewError} <button type="button" onClick={loadOverview}>重试</button></div>}
        {overview && <div className="summary-grid">
            <div className="summary-card primary"><span>总资产</span><strong>{money(overview.totalAssets)}</strong><small>{overview.name}</small></div>
            <div className="summary-card"><span>现金余额</span><strong>{money(overview.cash)}</strong><small>计入总资产</small></div>
            <div className="summary-card"><span>持仓市值</span><strong>{money(overview.investedValue)}</strong><small>{overview.holdings.length} 个标的</small></div>
          </div>}
        {overview && <OverviewDetails portfolio={overview} />}
      </section>

      {overview && <section className="panel risk-panel" role="region" aria-labelledby="risk-title">
        <div className="section-heading"><div><h2 id="risk-title">持仓风险提示</h2></div>
          <span className="result-status">{alertSource}</span></div>
        <Alerts alerts={visibleAlerts} />
      </section>}

      <div className="simulation-section">
        <section className="panel trade-panel" aria-labelledby="trade-title">
          <div className="section-heading"><div><p className="section-kicker">02 / 交易模拟</p><h2 id="trade-title">调仓模拟</h2></div>
            <div className="trade-actions">{viewedPlan && <span className="readonly-badge">只读方案</span>}
              {(viewedPlan || operations.length > 0) && <button type="button" className="text-button" onClick={resetSimulation} disabled={tradePending || savePending || Boolean(openPendingId)}>重置模拟</button>}</div></div>
          {viewedPlan && <div className="feedback info">正在查看「{viewedPlan.plan.name}」的模拟结果
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
          {visibleOperations.length === 0 ? <p className="quiet-state empty-trades">尚无模拟交易。添加交易后可查看调仓变化。</p> :
            <ol className="operation-list">{visibleOperations.map((item, index) => <li key={`${index}-${item.symbol}-${item.type}`}>
              <span className="operation-number">{String(index + 1).padStart(2, '0')}</span>
              <span className={`direction ${item.type}`}>{item.type === 'buy' ? '买入' : '卖出'}</span>
              <strong>{item.symbol}</strong><span>数量 {item.quantity}</span></li>)}</ol>}
        </section>

      </div>

      {before && <section className="panel comparison" aria-labelledby="comparison-title">
        <div className="section-heading"><div><p className="section-kicker">03 / 调仓变化</p><h2 id="comparison-title">调仓前后对比</h2></div>
          <span className={`result-status ${after ? 'ready' : ''}`}>{after ? (viewedPlan ? '已保存方案结果' : '模拟结果') : '待添加交易'}</span></div>
        {!after && <p className="quiet-state comparison-empty">尚无模拟交易。添加交易后可查看调仓前后变化。</p>}
        <div className="subheading"><h3>持仓明细</h3><span>原始 / 模拟后 / 变化</span></div>
        <HoldingsTable before={before} after={after} changes={changes} />
        <div className="subheading cash-heading"><h3>现金与总资产</h3></div>
        <div className="table-scroll"><table className="cash-table" aria-label="现金与总资产对比">
          <thead><tr><th scope="col">项目</th><th scope="col" className="numeric">原始</th>
            <th scope="col" className="numeric">模拟后</th><th scope="col" className="numeric">变化</th></tr></thead>
          <tbody><tr><th scope="row">现金余额</th><td className="numeric">{money(before.cash)}</td>
            <td className="numeric">{money(after?.cash)}</td><td className="numeric delta">{signed(changes?.cash)}</td></tr>
          <tr><th scope="row">总资产</th><td className="numeric">{money(before.totalAssets)}</td>
            <td className="numeric">{money(after?.totalAssets)}</td><td className="numeric delta">{signed(changes?.totalAssets)}</td></tr></tbody>
        </table></div>
        <div className="subheading industry-heading"><h3>行业分布</h3><span>现金不归入行业</span></div>
        <IndustryTable before={before} after={after} changes={changes} />
      </section>}
      <section className="panel plans-panel" aria-labelledby="plans-title">
        <div className="section-heading"><div><p className="section-kicker">04 / 方案管理</p><h2 id="plans-title">方案管理</h2></div></div>
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
        {plans.length > 0 && <ul className="plan-list">{plans.map((plan, index) => <li key={plan.id}>
          <div><strong>{plan.name}</strong><small>方案 {index + 1}</small></div>
          <button type="button" className="text-button" onClick={() => openPlan(plan.id)} disabled={Boolean(openPendingId)}>
            {openPendingId === plan.id ? '打开中…' : '打开'}</button></li>)}</ul>}
      </section>
    </main>
    <footer className="footer">调仓结果仅为模拟，不代表实际交易。</footer>
  </div>;
}
