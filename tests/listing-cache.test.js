let mockProxy = null;
jest.mock('@/lib/utils', () => ({ getDoubanProxyUrl: () => mockProxy }));
const originalFetch = global.fetch;
const params = { kind: 'movie', category: '热门', type: '全部' };
beforeEach(() => {
  jest.resetModules();
  mockProxy = null;
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('returning to the same public listing within one minute avoids another request', async () => {
  let now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ code: 200, list: [] }),
  }));
  const { getDoubanCategories } = require('@/lib/douban.client');
  await Promise.all([getDoubanCategories(params), getDoubanCategories(params)]);
  await getDoubanCategories(params);
  expect(fetch).toHaveBeenCalledTimes(1);
  now = 60000;
  await getDoubanCategories(params);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('page, category and proxy changes use separate cache entries', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ code: 200, list: [], items: [] }),
  }));
  const { getDoubanCategories } = require('@/lib/douban.client');
  await getDoubanCategories(params);
  await getDoubanCategories({ ...params, pageStart: 20 });
  await getDoubanCategories({ ...params, category: '最新' });
  mockProxy = 'https://proxy.example/?url=';
  await getDoubanCategories(params);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls[3][0]).toContain(mockProxy);
});

test('an HTTP failure can be retried immediately', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, list: [] }),
    });
  const { getDoubanList } = require('@/lib/douban.client');
  const listParams = { tag: '熱門', type: 'movie' };
  await expect(getDoubanList(listParams)).rejects.toThrow();
  await getDoubanList(listParams);
  expect(fetch).toHaveBeenCalledTimes(2);
});
