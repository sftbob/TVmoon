const React = require('react');
const {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
  act,
} = require('@testing-library/react');
const mockRouter = { push: jest.fn() };
let mockParams = new URLSearchParams('q=first');
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockParams,
}));
jest.mock('@/lib/db.client', () => ({
  addSearchHistory: jest.fn(),
  clearSearchHistory: jest.fn(),
  deleteSearchHistory: jest.fn(),
  getSearchHistory: jest.fn().mockResolvedValue([]),
  subscribeToDataUpdates: jest.fn(() => () => {}),
}));
jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
jest.mock('@/components/VideoCard', () => ({
  __esModule: true,
  default: ({ title, items }) => <div>{title || items?.[0]?.title}</div>,
}));
const SearchPage = require('@/app/search/page').default;
const result = (title) => ({
  title,
  id: title,
  source: 'test',
  year: '2026',
  episodes: ['episode'],
  type_name: 'movie',
});
const response = (results) => ({
  ok: true,
  status: 200,
  json: async () => ({ results }),
});
const originalFetch = global.fetch;
beforeEach(() => {
  localStorage.clear();
  mockParams = new URLSearchParams('q=first');
  mockRouter.push.mockClear();
  global.fetch = jest.fn().mockResolvedValue(response([result('first')]));
});
afterEach(cleanup);
afterAll(() => {
  global.fetch = originalFetch;
});

test('submission issues one request after navigation, rather than twice', async () => {
  const view = render(<SearchPage />);
  await screen.findByText('first');
  expect(fetch).toHaveBeenCalledTimes(1);
  const input = screen.getByRole('textbox', { name: '搜尋電影或影集' });
  fireEvent.change(input, { target: { value: 'second' } });
  fireEvent.submit(input.closest('form'));
  expect(mockRouter.push).toHaveBeenCalledWith('/search?q=second');
  expect(fetch).toHaveBeenCalledTimes(1);
  mockParams = new URLSearchParams('q=second');
  view.rerender(<SearchPage />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});
test('service failures show an actionable retry, then recover', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
  render(<SearchPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '搜尋服務暫時無法使用'
  );
  fireEvent.click(screen.getByRole('button', { name: '重新搜尋' }));
  expect(await screen.findByText('first')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('late results from a cancelled query never replace newer results', async () => {
  let resolveFirst;
  global.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
  );
  global.fetch.mockResolvedValue(response([result('second')]));
  const view = render(<SearchPage />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = fetch.mock.calls[0][1].signal;
  mockParams = new URLSearchParams('q=second');
  view.rerender(<SearchPage />);
  expect(await screen.findByText('second')).toBeInTheDocument();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolveFirst(response([result('first')]));
  });
  expect(screen.queryByText('first')).not.toBeInTheDocument();
});
test('empty results are distinct from a request failure', async () => {
  global.fetch.mockResolvedValue(response([]));
  render(<SearchPage />);
  await screen.findByText(/沒有找到|未找到|無.*結果/);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
