async function request(route, options = {}) {
  let response;
  try {
    response = await fetch(route, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error('服务暂时无法连接，请稍后重试。');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('暂时无法读取结果，请稍后重试。');
  }
  if (!response.ok) {
    const detail = body?.error;
    const messages = {
      INSUFFICIENT_CASH: '现金余额不足。',
      INSUFFICIENT_HOLDINGS: '持仓数量不足。',
      INVALID_QUANTITY: '请输入大于 0 的整数。',
      INVALID_SYMBOL: '请选择有效的交易标的。',
      INVALID_TYPE: '请选择买入或卖出。',
      INVALID_SNAPSHOT: '当前价格基准不可用，请刷新页面。',
      EMPTY_PLAN: '请先添加至少一笔交易。',
      INVALID_NAME: '请输入方案名称。',
      PLAN_NOT_FOUND: '方案不存在。',
    };
    throw new Error(messages[detail?.code] || detail?.message || '操作未完成，请稍后重试。');
  }
  return body;
}

export const api = {
  portfolio: () => request('/api/portfolio'),
  simulate: (snapshotId, operations) => request('/api/simulations', {
    method: 'POST',
    body: JSON.stringify({ snapshot_id: snapshotId, operations }),
  }),
  listPlans: () => request('/api/plans'),
  savePlan: (name, snapshotId, operations) => request('/api/plans', {
    method: 'POST',
    body: JSON.stringify({ name, snapshot_id: snapshotId, operations }),
  }),
  openPlan: (id) => request(`/api/plans/${encodeURIComponent(id)}`),
};
