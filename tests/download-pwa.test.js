const React = require('react');
const { render, fireEvent, screen, cleanup, act } = require('@testing-library/react');
const VideoTransfer = require('@/components/VideoTransfer').default;
const { default: PwaInstallButton, PwaInstallProvider } = require('@/components/PwaInstallButton');
let standalone = false;
beforeEach(() => {
  standalone = false;
  window.matchMedia = jest.fn(() => ({ matches: standalone }));
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.open = false; });
});
afterEach(cleanup);

test('MP4 provides an original-file link and source-specific copy', async () => {
  const url = 'https://media.example/movie.mp4?token=test';
  render(<VideoTransfer url={url} />);
  const link = screen.getByRole('link', { name: '下載／開啟影片檔' });
  expect(link.href).toBe(url);
  expect(link.rel).toBe('noopener noreferrer');
  fireEvent.click(screen.getByRole('button', { name: '複製播放網址' }));
  await screen.findByText('播放網址已複製');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url);
});

test('streams never masquerade as downloadable MP4; failed clipboard supports manual copy', async () => {
  navigator.clipboard.writeText.mockRejectedValue(new Error('Denied'));
  render(<VideoTransfer url='https://media.example/master.m3u8' />);
  expect(screen.queryByRole('link')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '複製播放網址' }));
  const field = await screen.findByRole('textbox', { name: '播放網址' });
  expect(field.value).toBe('https://media.example/master.m3u8');
});

test('changing source clears copy status and rejects unsafe protocols', async () => {
  const view = render(<VideoTransfer url='https://media.example/first.mp4' />);
  fireEvent.click(screen.getByRole('button', { name: '複製播放網址' }));
  await screen.findByText('播放網址已複製');
  view.rerender(<VideoTransfer url='https://media.example/second.m3u8' />);
  expect(screen.queryByText('播放網址已複製')).toBeNull();
  view.rerender(<VideoTransfer url='javascript:alert(1)' />);
  expect(screen.queryByRole('button')).toBeNull();
});

test('install prompt is captured before the user opens the menu', async () => {
  const view = render(<PwaInstallProvider />);
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  act(() => window.dispatchEvent(event));
  view.rerender(<PwaInstallProvider><PwaInstallButton /></PwaInstallProvider>);
  fireEvent.click(screen.getByRole('button', { name: '安裝 App' }));
  await act(async () => {});
  expect(event.defaultPrevented).toBe(true);
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: '安裝 App' })).toBeNull();
});

test('late copy completion never reports success for a different episode', async () => {
  let complete;
  navigator.clipboard.writeText.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const view = render(<VideoTransfer url='https://media.example/first.mp4' />);
  fireEvent.click(screen.getByRole('button', { name: '複製播放網址' }));
  view.rerender(<VideoTransfer url='https://media.example/second.mp4' />);
  await act(async () => complete());
  expect(screen.queryByText('播放網址已複製')).toBeNull();
});

test('unsupported browser shows platform guidance without claiming an installation', () => {
  render(<PwaInstallProvider><PwaInstallButton /></PwaInstallProvider>);
  fireEvent.click(screen.getByRole('button', { name: '安裝 App' }));
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/iPhone／iPad/)).toBeTruthy();
  expect(screen.getByRole('button', { name: '安裝 App' })).toBeTruthy();
});

test('standalone PWA hides the installation entry', () => {
  standalone = true;
  render(<PwaInstallProvider><PwaInstallButton /></PwaInstallProvider>);
  expect(screen.queryByRole('button', { name: '安裝 App' })).toBeNull();
});
