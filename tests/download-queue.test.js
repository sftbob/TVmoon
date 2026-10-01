const React = require('react');
const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const DownloadQueue = require('@/components/DownloadQueue').default;
const { readDownloadItems, mergeDownloadItems, makeDownloadJob } = require('@/lib/download-queue');
const detail = { source: 'one', id: 'movie', title: '測試劇', episodes: ['https://media.example/1.m3u8', 'https://media.example/2.m3u8'] };
beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

test('queue rejects unsafe URLs and restores only valid bounded settings', () => {
  const items = readDownloadItems([{ id: 'a', title: 'test', episode: 1, url: 'javascript:alert(1)' }, { id: 'b', title: 'test', episode: 2, url: detail.episodes[0] }]);
  expect(items).toHaveLength(1);
  expect(makeDownloadJob(items, 100, 3)).toMatchObject({ parallel: 3, fragments: 4 });
  expect(readDownloadItems([{ ...items[0], episode: 1.5 }])).toEqual([]);
});

test('readding an episode updates an expired URL without duplication', () => {
  const item = { id: 'same', title: 'test', episode: 1, url: detail.episodes[0] };
  const result = mergeDownloadItems([item], [{ ...item, url: detail.episodes[1] }]);
  expect(result).toEqual([{ ...item, url: detail.episodes[1] }]);
});

test('bulk add survives reload and changing shows does not reuse episode selection', () => {
  const view = render(<DownloadQueue detail={detail} />);
  fireEvent.click(screen.getByRole('button', { name: '全選集數' }));
  fireEvent.click(screen.getByRole('button', { name: '加入待下載清單' }));
  expect(screen.getByText('測試劇 · 第 1 集')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: '同時下載數' }), { target: { value: '3' } });
  view.rerender(<DownloadQueue detail={{ ...detail, id: 'other', title: '另一劇' }} />);
  expect(screen.getByRole('button', { name: '加入待下載清單' }).disabled).toBe(true);
  view.unmount();
  render(<DownloadQueue detail={detail} />);
  expect(screen.getByRole('combobox', { name: '同時下載數' }).value).toBe('3');
  expect(screen.getByText('測試劇 · 第 2 集')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '移除勾選' }));
  expect(screen.queryByText('測試劇 · 第 1 集')).toBeNull();
});

test('export contains selected tasks only, and does not claim downloads completed', async () => {
  localStorage.setItem('tvmoon-downloads:owner', JSON.stringify(makeDownloadJob([
    { id: '1', title: 'one', episode: 1, url: detail.episodes[0] },
    { id: '2', title: 'two', episode: 2, url: detail.episodes[1] },
  ], 2, 4)));
  URL.createObjectURL = jest.fn(() => 'blob:test');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<DownloadQueue detail={detail} />);
  fireEvent.click(screen.getByLabelText('two · 第 2 集'));
  fireEvent.click(screen.getByRole('button', { name: '匯出勾選任務（1）' }));
  expect(click).toHaveBeenCalledTimes(1);
  const blob = URL.createObjectURL.mock.calls[0][0];
  const json = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(JSON.parse(reader.result)); reader.readAsText(blob); });
  expect(json.items.map((item) => item.id)).toEqual(['1']);
  expect(screen.getByText(/网站尚未开始下载|網站尚未開始下載/)).toBeTruthy();
  click.mockRestore();
});
