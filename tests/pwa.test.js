const React = require('react');
const { render, fireEvent, screen, cleanup, act } = require('@testing-library/react');
const { default: PwaInstallButton, PwaInstallProvider } = require('@/components/PwaInstallButton');
let standalone = false;
beforeEach(() => {
  standalone = false;
  window.matchMedia = jest.fn(() => ({ matches: standalone }));
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.open = false; });
});
afterEach(cleanup);




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
