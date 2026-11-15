async function request(route, options = {}) {
  let response;
  try {
    response = await fetch(route, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error('无法连接后端服务，请检查 API 服务是否已启动。');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('服务器返回了无法读取的响应。');
  }
  if (!response.ok) {
    const detail = body?.error;
    const sequence = detail?.tradeIndex ? `（第 ${detail.tradeIndex} 笔交易）` : '';
    throw new Error(`${detail?.message || '请求失败'}${sequence}`);
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
