const React = require('react');
const { render, screen, act, cleanup } = require('@testing-library/react');
jest.mock('@/lib/douban.client', () => ({ getDoubanCategories: jest.fn() }));
jest.mock('@/lib/db.client', () => ({
  getAllFavorites: jest.fn(async () => ({})),
  getAllPlayRecords: jest.fn(async () => ({})),
  subscribeToDataUpdates: jest.fn(() => () => {}),
}));
jest.mock('@/components/SiteProvider', () => ({
  useSite: () => ({ announcement: '' }),
}));
jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
jest.mock('@/components/ScrollableRow', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
jest.mock('@/components/CinemaHero', () => ({
  __esModule: true,
  default: () => <div />,
}));
jest.mock('@/components/ContinueWatching', () => ({
  __esModule: true,
  default: () => <div />,
}));
jest.mock('@/components/VideoCard', () => ({
  __esModule: true,
  default: ({ title }) => <div>{title}</div>,
}));
const { getDoubanCategories } = require('@/lib/douban.client');
const HomePage = require('@/app/page').default;
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test('fast movie results render while other sections are pending or fail', async () => {
  let resolveTv, rejectShow;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  getDoubanCategories.mockImplementation(({ category }) => {
    if (category === '热门')
      return Promise.resolve({
        code: 200,
        list: [{ id: '1', title: '先到的電影' }],
      });
    if (category === 'tv')
      return new Promise((resolve) => {
        resolveTv = resolve;
      });
    return new Promise((_, reject) => {
      rejectShow = reject;
    });
  });
  render(<HomePage />);
  expect(await screen.findByText('先到的電影')).toBeInTheDocument();
  await act(async () => {
    rejectShow(new Error('source unavailable'));
  });
  expect(screen.getByText('先到的電影')).toBeInTheDocument();
  await act(async () => {
    resolveTv({ code: 200, list: [{ id: '2', title: '稍後的影集' }] });
  });
  expect(screen.getByText('稍後的影集')).toBeInTheDocument();
});
