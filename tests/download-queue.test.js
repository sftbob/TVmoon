const React = require('react');
const { webcrypto, randomUUID } = require('crypto');
const { TextEncoder } = require('util');
const { render, screen, fireEvent, cleanup, waitFor, act } = require('@testing-library/react');
const DownloadQueue = require('@/components/DownloadQueue').default;
const { readQueueMetadata, metadataFromDetail, mergeQueueMetadata } = require('@/lib/download-queue');
const { prepareRequest, validMediaUrl } = require('@/lib/tianding-contract');
const detail = { source: 'one', source_name: '來源 A', id: 'movie', title: '測試劇', episodes: ['https://media.example/1.m3u8?signature=private', 'https://media.example/2.mp4?opaque=private'] };
let messages;
const response = (request, fields) => window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data: { channel: 'tianding.tvmoon.v1', type: 'response', payload: { version: 1, requestId: request.requestId, ...fields } } }));
const reply = (request, statuses = request.items.map(() => 'accepted'), execution = 'started') => response(request, {
  ok: statuses.some((s) => s !== 'rejected'), stage: execution === 'not_started' ? 'desktop_queued' : 'execution_started',
  code: statuses.includes('rejected') ? 'PARTIAL' : 'OK', execution, replayed: false,
  accepted: statuses.filter((s) => s === 'accepted').length, duplicates: statuses.filter((s) => s === 'duplicate').length, rejected: statuses.filter((s) => s === 'rejected').length,
  results: statuses.map((s, index) => ({ index, clientItemId: request.items[index].clientItemId, status: s, code: s === 'rejected' ? 'QUEUE_FULL' : s === 'duplicate' ? 'DUPLICATE' : 'ACCEPTED' })),
});
beforeEach(() => {
  localStorage.clear(); messages = [];
  Object.defineProperty(window, 'crypto', { configurable: true, value: { subtle: webcrypto.subtle, randomUUID } });
  global.TextEncoder = TextEncoder;
  window.postMessage = jest.fn(({ payload }) => {
    messages.push(payload);
    if (payload.action === 'probe') response(payload, { ok: true, stage: 'extension_received', code: 'AVAILABLE', extensionVersion: '2.9.0', contractVersion: 1, maxItems: 50, desktopVerified: false });
  });
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => detail }));
});
afterEach(() => { cleanup(); jest.useRealTimers(); });
async function addAll() {
  fireEvent.click(screen.getByRole('button', { name: '全選集數' }));
  fireEvent.click(screen.getByRole('button', { name: '加入待下載清單' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '交給添丁下載（2）' }).disabled).toBe(false));
}
const batch = () => messages.filter((p) => p.action === 'enqueueBatch');

test('migration scrubs URLs for all accounts, retains identities and refetches actual media', async () => {
  const old = { id: JSON.stringify(['one', 'movie', 0]), title: detail.title, episode: 1, url: detail.episodes[0] };
  localStorage.setItem('tvmoon-downloads:owner', JSON.stringify({ items: [old], parallel: 3, fragments: 8 }));
  localStorage.setItem('tvmoon-downloads:other', JSON.stringify({ items: [old] }));
  render(<DownloadQueue detail={detail} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '交給添丁下載（1）' }).disabled).toBe(false));
  for (const key of ['tvmoon-downloads:owner', 'tvmoon-downloads:other']) {
    expect(localStorage.getItem(key)).not.toMatch(/signature|opaque|media.example|parallel|fragments|"url"/);
  }
  expect(batch()).toHaveLength(0);
  expect(fetch.mock.calls[0][0]).toContain('handoff=1');
  expect(fetch.mock.calls[0][1].cache).toBe('no-store');
});

test('prepare before click; one synchronous send uses exact signature and stable IDs, shows actual stage', async () => {
  render(<DownloadQueue detail={detail} />); await addAll();
  expect(batch()).toHaveLength(0);
  const fetchCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '交給添丁下載（2）' }));
  expect(batch()).toHaveLength(1);
  expect(fetch.mock.calls.length).toBe(fetchCount);
  const request = batch()[0];
  expect(Object.keys(request).sort()).toEqual(['action', 'items', 'requestId', 'startAfterEnqueue', 'version']);
  expect(request.items[0].mediaUrl).toBe(detail.episodes[0]);
  expect(request.items[0].clientItemId).toMatch(/^tvmoon-[a-f0-9]{64}$/);
  expect(Object.keys(request.items[0]).sort()).toEqual(['clientItemId', 'episode', 'mediaUrl', 'title']);
  act(() => reply(request, ['accepted', 'duplicate'], 'already_running'));
  await screen.findByText('已追加至正在執行的添丁清單。');
  expect(screen.getByText('接受 1 · 重複 1 · 拒絕 0')).toBeTruthy();
  expect(screen.queryByText('下載完成')).toBeNull();
});

test('partial rejection lists episode and new request contains only rejected items', async () => {
  render(<DownloadQueue detail={detail} />); await addAll();
  fireEvent.click(screen.getByRole('button', { name: '交給添丁下載（2）' }));
  const first = batch()[0]; act(() => reply(first, ['accepted', 'rejected']));
  await screen.findByText(/測試劇 · 第 2 集：QUEUE_FULL/);
  fireEvent.click(screen.getByRole('button', { name: '只勾選被拒集數，重新準備' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '交給添丁下載（1）' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '交給添丁下載（1）' }));
  expect(batch()[1].requestId).not.toBe(first.requestId);
  expect(batch()[1].items.map((item) => item.episode)).toEqual([2]);
});

test('timeout is unknown, selection locks, user retry resends exact request without automatic batches', async () => {
  render(<DownloadQueue detail={detail} />); await addAll(); await act(async () => {}); jest.useFakeTimers({ shouldClearNativeTimers: true });
  fireEvent.click(screen.getByRole('button', { name: '交給添丁下載（2）' }));
  const first = batch()[0];
  await act(async () => { jest.advanceTimersByTime(65000); });
  expect(screen.getByText(/交接等待逾時，結果未知/)).toBeTruthy();
  expect(screen.getByRole('button', { name: '移除勾選' }).disabled).toBe(true);
  expect(batch()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '用原請求手動重試' }));
  expect(batch()[1]).toBe(first);
  act(() => response(first, { ok: false, stage: 'rejected', code: 'RECEIPT_UNCERTAIN' }));
  await act(async () => {});
  expect(screen.queryByRole('button', { name: '用原請求手動重試' })).toBeNull();
  expect(screen.getByRole('button', { name: '核對後重新選擇' }).disabled).toBe(true);
});

test('button disabled while media fetch is pending, old preparation cannot overwrite changed selection', async () => {
  let resolve; fetch.mockImplementation(() => new Promise((r) => { resolve = r; }));
  render(<DownloadQueue detail={detail} />);
  fireEvent.click(screen.getByRole('button', { name: '全選集數' }));
  fireEvent.click(screen.getByRole('button', { name: '加入待下載清單' }));
  expect(screen.getByRole('button', { name: '交給添丁下載（2）' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '取消清單勾選' }));
  await act(async () => { resolve({ ok: true, json: async () => detail }); });
  expect(screen.getByRole('button', { name: '交給添丁下載（0）' }).disabled).toBe(true);
  expect(batch()).toHaveLength(0);
});

test('51 selected tasks are blocked, never truncated or automatically split', async () => {
  const many = { ...detail, episodes: Array.from({ length: 51 }, () => detail.episodes[0]) };
  localStorage.setItem('tvmoon-downloads:owner', JSON.stringify({ items: metadataFromDetail(many, many.episodes.map((_, i) => i)) }));
  render(<DownloadQueue detail={many} />);
  expect(screen.getByRole('button', { name: '全選集數' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: '交給添丁下載（51）' }).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('1–50');
  expect(fetch).not.toHaveBeenCalled(); expect(batch()).toHaveLength(0);
  await act(async () => {});
});

test('whole rejection presents desktop setup guidance; incompatible and missing probe do not imply readiness', async () => {
  render(<DownloadQueue detail={detail} />); await addAll();
  fireEvent.click(screen.getByRole('button', { name: '交給添丁下載（2）' }));
  act(() => response(batch()[0], { ok: false, stage: 'rejected', code: 'SETTINGS_REQUIRED', accepted: 0, duplicates: 0, rejected: 2, results: [], execution: 'not_started', replayed: false }));
  await screen.findByText(/SETTINGS_REQUIRED：/);
  expect(screen.getByText('接受 0 · 重複 0 · 拒絕 2')).toBeTruthy();
  window.postMessage.mockImplementation(({ payload }) => response(payload, { ok: true, code: 'AVAILABLE', contractVersion: 1, extensionVersion: '2.7.0', maxItems: 50 }));
  fireEvent.click(screen.getByRole('button', { name: '查詢插件' }));
  await screen.findByText('請更新為桌面與插件 2.9.0 相容候選版本（契約 1）。');
});

test('contract validation preserves opaque bytes and IDs across URL refresh, rejects lengths and credentials', async () => {
  const metadata = metadataFromDetail(detail, [0])[0];
  const one = await prepareRequest([{ ...metadata, url: detail.episodes[0] }]);
  const two = await prepareRequest([{ ...metadata, url: detail.episodes[0] + '&new=2' }]);
  expect(one.items[0].clientItemId).toBe(two.items[0].clientItemId);
  expect(one.requestId).not.toBe(two.requestId);
  expect(one.items[0].mediaUrl).toBe(detail.episodes[0]);
  expect(validMediaUrl('https://user:pass@media.example/a.mp4')).toBe(false);
  expect(validMediaUrl('https://media.example/' + 'a'.repeat(8192))).toBe(false);
  await expect(prepareRequest([{ ...metadata, title: 'a'.repeat(201), url: detail.episodes[0] }])).rejects.toThrow('INVALID_ITEM');
  expect(readQueueMetadata([{ ...metadata, url: 'secret', preparedRequest: one }])[0]).not.toHaveProperty('url');
  expect(() => mergeQueueMetadata(metadataFromDetail({ ...detail, episodes: [] }, Array.from({ length: 500 }, (_, i) => i)), metadataFromDetail(detail, [501]))).toThrow('QUEUE_FULL');
});
