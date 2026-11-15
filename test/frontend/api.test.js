import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../src/client/api.js';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['INSUFFICIENT_CASH', '现金余额不足。'],
  ['INSUFFICIENT_HOLDINGS', '持仓数量不足。'],
  ['INVALID_QUANTITY', '请输入大于 0 的整数。'],
])('turns %s into a short user message without code or trade index', async (code, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: { code, message: '内部错误说明', tradeIndex: 2 } }),
  }));
  await expect(api.simulate('SNAP-20261102', [])).rejects.toThrow(message);
  expect(fetch).toHaveBeenCalledOnce();
});
