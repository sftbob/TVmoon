/** @jest-environment ./tests/node-environment.cjs */
jest.mock('@/lib/config', () => ({
  API_CONFIG: { search: { path: '?wd=', headers: {} } },
  getConfig: jest.fn(async () => ({
    SiteConfig: { SearchDownstreamMaxPage: 1, DisableYellowFilter: true },
    SourceConfig: [{ key: 'test', name: 'test', api: 'https://api.example/' }],
  })),
  getCacheTime: jest.fn(async () => 60),
}));
jest.mock('@/lib/utils', () => ({ cleanHtmlTags: (value) => value || '' }));
const { getSearchQueries, normalizeSearchTitle } = require('@/lib/search-text');
const { searchFromApi } = require('@/lib/downstream');
const { GET: searchOne } = require('@/app/api/search/one/route');
const site = { key: 'test', name: 'test', api: 'https://api.example/' };
const originalFetch = global.fetch;
const item = (id, title) => ({ vod_id: id, vod_name: title, vod_pic: '' });
const response = (list) => ({ ok: true, json: async () => ({ list }) });
afterEach(() => {
  global.fetch = originalFetch;
});

test('Traditional, mixed and Taiwanese variant characters get a Simplified query', () => {
  expect(getSearchQueries('  龍貓  ')).toEqual(['龍貓', '龙猫']);
  expect(getSearchQueries('臺灣电影')).toEqual(['臺灣电影', '台湾电影']);
  expect(getSearchQueries('魔髮奇緣')).toEqual(['魔髮奇緣', '魔发奇缘']);
});

test('unchanged queries are requested once and blank input is ignored', async () => {
  expect(getSearchQueries('龙猫')).toEqual(['龙猫']);
  expect(getSearchQueries('Inside Out 2')).toEqual(['Inside Out 2']);
  global.fetch = jest.fn(async () => response([]));
  await searchFromApi(site, '龙猫');
  expect(fetch).toHaveBeenCalledTimes(1);
  await searchFromApi(site, '  ');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('searches both spellings and deduplicates source IDs, preserving original titles', async () => {
  global.fetch = jest.fn(async (url) =>
    new URL(url).searchParams.get('wd') === '龍貓'
      ? response([item('1', '龍貓')])
      : response([item('1', '龙猫'), item('2', '龙猫：特别篇')])
  );
  const results = await searchFromApi(site, '龍貓');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(results.map(({ id, title }) => [id, title])).toEqual([
    ['1', '龍貓'],
    ['2', '龙猫：特别篇'],
  ]);
});

test('one failed spelling does not discard the other spelling results', async () => {
  global.fetch = jest.fn(async (url) =>
    new URL(url).searchParams.get('wd') === '龍貓'
      ? { ok: false, status: 503 }
      : response([item('2', '龙猫')])
  );
  expect((await searchFromApi(site, '龍貓')).map((r) => r.id)).toEqual(['2']);
});

test('matching ignores script, whitespace and English case but preserves distinct titles', () => {
  expect(normalizeSearchTitle(' 龍 貓\tABC ')).toBe(
    normalizeSearchTitle('龙猫abc')
  );
  expect(normalizeSearchTitle('龍貓2')).not.toBe(normalizeSearchTitle('龍貓'));
});

test('single-source exact search accepts Simplified titles for Traditional input', async () => {
  global.fetch = jest.fn(async () =>
    response([item('1', '龙猫'), item('2', '龙猫2')])
  );
  const res = await searchOne(
    new Request('https://example.test/api/search/one?q=龍貓&resourceId=test')
  );
  expect(res.status).toBe(200);
  expect((await res.json()).results.map((r) => r.id)).toEqual(['1']);
});
