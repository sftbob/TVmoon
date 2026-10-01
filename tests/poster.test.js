const React = require('react');
const {
  render,
  fireEvent,
  screen,
  cleanup,
  act,
} = require('@testing-library/react');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ fill, priority, onLoadingComplete, ...props }) => (
    <img {...props} onLoad={onLoadingComplete} />
  ),
}));
jest.mock('@/lib/db.client', () => ({
  isFavorited: jest.fn().mockResolvedValue(false),
  generateStorageKey: jest.fn(),
  subscribeToDataUpdates: jest.fn(() => () => {}),
}));
const VideoCard = require('@/components/VideoCard').default;
const { getInitialPosterUrl, rememberPosterProxyHost } = require('@/lib/utils');
const first = 'https://img3.doubanio.com/first.jpg';
const second = 'https://another.example/second.jpg';
const proxy = (url) => `/api/image-proxy?url=${encodeURIComponent(url)}`;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  delete window.IntersectionObserver;
});

test('a successful direct image never needs a proxy', () => {
  render(<VideoCard from='douban' title='Poster' poster={first} />);
  const image = screen.getByAltText('Poster');
  expect(image.getAttribute('src')).toBe(first);
  fireEvent.load(image);
  expect(image.getAttribute('src')).toBe(first);
  expect(sessionStorage.getItem('posterProxyHosts')).toBeNull();
});

test('failed direct image retries once with proxy and remembers only success', () => {
  render(<VideoCard from='douban' title='Poster' poster={first} />);
  const image = screen.getByAltText('Poster');
  fireEvent.error(image);
  expect(image.getAttribute('src')).toBe(proxy(first));
  expect(sessionStorage.getItem('posterProxyHosts')).toBeNull();
  fireEvent.error(image);
  expect(image.getAttribute('src')).toBe(proxy(first));
  fireEvent.load(image);
  expect(getInitialPosterUrl('https://img3.doubanio.com/next.jpg')).toBe(
    proxy('https://img3.doubanio.com/next.jpg')
  );
});

test('changing poster resets fallback and aggregation starts with its real poster', () => {
  const view = render(
    <VideoCard
      from='search'
      title='Poster'
      items={[{ title: 'Poster', poster: first, episodes: [] }]}
    />
  );
  expect(screen.getByAltText('Poster').getAttribute('src')).toBe(first);
  fireEvent.error(screen.getByAltText('Poster'));
  view.rerender(<VideoCard from='douban' title='Poster' poster={second} />);
  expect(screen.getByAltText('Poster').getAttribute('src')).toBe(second);
});

test('host hint expires and respects the currently selected proxy', () => {
  rememberPosterProxyHost(first);
  localStorage.setItem('enableImageProxy', 'true');
  localStorage.setItem('imageProxyUrl', '/custom-proxy?url=');
  expect(getInitialPosterUrl(first)).toBe(
    `/custom-proxy?url=${encodeURIComponent(first)}`
  );
  sessionStorage.setItem(
    'posterProxyHosts',
    JSON.stringify({ 'img3.doubanio.com': Date.now() - 1 })
  );
  expect(getInitialPosterUrl(first)).toBe(first);
});

test('invalid browser cache does not break poster loading', () => {
  sessionStorage.setItem('posterProxyHosts', 'invalid json');
  expect(getInitialPosterUrl(first)).toBe(first);
});

test('visible pending posters fall back after eight seconds, offscreen posters wait', () => {
  jest.useFakeTimers();
  let notify;
  window.IntersectionObserver = jest.fn((callback) => {
    notify = callback;
    return { observe: jest.fn(), disconnect: jest.fn() };
  });
  render(<VideoCard from='douban' title='Slow' poster={first} />);
  const image = screen.getByAltText('Slow');
  act(() => jest.advanceTimersByTime(12000));
  expect(image.getAttribute('src')).toBe(first);
  act(() => notify([{ isIntersecting: true }]));
  act(() => jest.advanceTimersByTime(7999));
  expect(image.getAttribute('src')).toBe(first);
  act(() => jest.advanceTimersByTime(1));
  expect(image.getAttribute('src')).toBe(proxy(first));
});

test('a loaded poster and a changed poster never receive the old timeout', () => {
  jest.useFakeTimers();
  const view = render(<VideoCard from='douban' title='Ready' poster={first} />);
  fireEvent.load(screen.getByAltText('Ready'));
  act(() => jest.advanceTimersByTime(12000));
  expect(screen.getByAltText('Ready').getAttribute('src')).toBe(first);
  view.rerender(<VideoCard from='douban' title='Ready' poster={second} />);
  act(() => jest.advanceTimersByTime(4000));
  view.rerender(<VideoCard from='douban' title='Ready' poster={first} />);
  act(() => jest.advanceTimersByTime(4000));
  expect(screen.getByAltText('Ready').getAttribute('src')).toBe(first);
});

test('successful proxy unblocks pending siblings without replacing loaded images', () => {
  render(
    <>
      <VideoCard from='douban' title='Trigger' poster={first} />
      <VideoCard
        from='douban'
        title='Pending'
        poster='https://img3.doubanio.com/pending.jpg'
      />
      <VideoCard
        from='douban'
        title='Loaded'
        poster='https://img3.doubanio.com/loaded.jpg'
      />
      <VideoCard from='douban' title='Other' poster={second} />
    </>
  );
  fireEvent.load(screen.getByAltText('Loaded'));
  fireEvent.error(screen.getByAltText('Trigger'));
  expect(screen.getByAltText('Pending').getAttribute('src')).toContain(
    '/pending.jpg'
  );
  fireEvent.load(screen.getByAltText('Trigger'));
  expect(screen.getByAltText('Pending').getAttribute('src')).toBe(
    proxy('https://img3.doubanio.com/pending.jpg')
  );
  expect(screen.getByAltText('Loaded').getAttribute('src')).toBe(
    'https://img3.doubanio.com/loaded.jpg'
  );
  expect(screen.getByAltText('Other').getAttribute('src')).toBe(second);
});
