const React = require('react');
const {
  render,
  fireEvent,
  screen,
  cleanup,
} = require('@testing-library/react');
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
const QuickSearch = require('@/components/QuickSearch').default;
const { createRequestCache } = require('@/lib/request-cache');
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  mockPush.mockClear();
});

test('quick search prevents a document reload and uses client navigation', () => {
  render(<QuickSearch />);
  const input = screen.getByRole('textbox', { name: '快速搜尋電影或影集' });
  fireEvent.change(input, { target: { value: '  龍貓  ' } });
  expect(fireEvent.submit(input.closest('form'))).toBe(false);
  expect(mockPush).toHaveBeenCalledWith('/search?q=%E9%BE%8D%E8%B2%93');
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.submit(input.closest('form'));
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('cache shares concurrent requests and starts TTL after completion', async () => {
  let now = 0,
    resolve;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const cache = createRequestCache(60, 2);
  const load = jest.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const first = cache('movie', load);
  expect(cache('movie', load)).toBe(first);
  await Promise.resolve();
  now = 100;
  resolve('result');
  expect(await first).toBe('result');
  now = 159;
  expect(await cache('movie', load)).toBe('result');
  expect(load).toHaveBeenCalledTimes(1);
  now = 160;
  expect(await cache('movie', async () => 'fresh')).toBe('fresh');
});

test('failed and unsuccessful results are not retained', async () => {
  const cache = createRequestCache(100, 2, (value) => value.ok);
  await expect(
    cache('movie', async () => {
      throw new Error('offline');
    })
  ).rejects.toThrow('offline');
  expect(await cache('movie', async () => ({ ok: false }))).toEqual({
    ok: false,
  });
  expect(await cache('movie', async () => ({ ok: true }))).toEqual({
    ok: true,
  });
});

test('bounded cache evicts old keys instead of growing indefinitely', async () => {
  const cache = createRequestCache(10000, 2);
  await cache('one', async () => 1);
  await cache('two', async () => 2);
  await cache('three', async () => 3);
  expect(await cache('one', async () => 4)).toBe(4);
});
