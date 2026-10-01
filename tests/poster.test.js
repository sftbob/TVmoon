const React = require('react');
const { render, fireEvent, screen, cleanup } = require('@testing-library/react');
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ fill, onLoadingComplete, ...props }) =>
    <img {...props} onLoad={onLoadingComplete} />,
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
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

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
  const view = render(<VideoCard from='search' title='Poster' items={[
    { title: 'Poster', poster: first, episodes: [] },
  ]} />);
  expect(screen.getByAltText('Poster').getAttribute('src')).toBe(first);
  fireEvent.error(screen.getByAltText('Poster'));
  view.rerender(<VideoCard from='douban' title='Poster' poster={second} />);
  expect(screen.getByAltText('Poster').getAttribute('src')).toBe(second);
});

test('host hint expires and respects the currently selected proxy', () => {
  rememberPosterProxyHost(first);
  localStorage.setItem('enableImageProxy', 'true');
  localStorage.setItem('imageProxyUrl', '/custom-proxy?url=');
  expect(getInitialPosterUrl(first)).toBe(`/custom-proxy?url=${encodeURIComponent(first)}`);
  sessionStorage.setItem('posterProxyHosts', JSON.stringify({ 'img3.doubanio.com': Date.now() - 1 }));
  expect(getInitialPosterUrl(first)).toBe(first);
});

test('invalid browser cache does not break poster loading', () => {
  sessionStorage.setItem('posterProxyHosts', 'invalid json');
  expect(getInitialPosterUrl(first)).toBe(first);
});
