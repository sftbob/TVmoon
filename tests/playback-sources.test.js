jest.mock('@/lib/config', () => ({ API_CONFIG: { detail: { path: '?id=', headers: {} } } }));
jest.mock('@/lib/utils', () => ({ cleanHtmlTags: (value) => value || '' }));
const { getDetailFromApi } = require('@/lib/downstream');
afterEach(() => jest.restoreAllMocks());
test('detail keeps full signatures including dollar characters', async () => {
  const url = 'https://media.example/one.m3u8?signature=a$b&opaque=x%2Fy';
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ list: [{ vod_name: 'movie', vod_play_url: `第一集$${url}`, vod_content: '' }] }) }));
  const detail = await getDetailFromApi({ key: 'test', name: 'test', api: 'https://api.example/' }, '1');
  expect(detail.episodes).toEqual([url]);
});
test('special HTML source preserves signed query parameters rather than cutting at m3u8', async () => {
  const url = 'https://media.example/one.m3u8?signature=a%2Fb&expires=123';
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => `<h1>movie</h1><p>第一集$${url}#第二集$https://media.example/two.m3u8</p>` }));
  const detail = await getDetailFromApi({ key: 'test', name: 'test', detail: 'https://api.example/' }, '1');
  expect(detail.episodes).toEqual([url, 'https://media.example/two.m3u8']);
});
