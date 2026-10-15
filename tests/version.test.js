/** @jest-environment ./tests/node-environment.cjs */
const fs = require('fs');
const path = require('path');
let CURRENT_VERSION, checkForUpdates, UpdateStatus;
const originalFetch = global.fetch;
beforeEach(() => {
  jest.resetModules();
  ({
    CURRENT_VERSION,
    checkForUpdates,
    UpdateStatus,
  } = require('@/lib/version'));
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('displayed build version matches the committed VERSION.txt', () => {
  expect(CURRENT_VERSION).toMatch(/^\d{14}$/);
  expect(
    fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8').trim()
  ).toBe(CURRENT_VERSION);
});

test('updates are checked against the personal repository main', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => String(Number(CURRENT_VERSION) + 1),
  }));
  expect(await checkForUpdates()).toBe(UpdateStatus.HAS_UPDATE);
  expect(fetch.mock.calls[0][0]).toBe(
    'https://raw.githubusercontent.com/sftbob/TVmoon/main/VERSION.txt'
  );
});

test('multiple menus and route remounts share one version request for ten minutes', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => CURRENT_VERSION,
  }));
  await Promise.all([checkForUpdates(), checkForUpdates()]);
  await checkForUpdates();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('invalid version responses do not become a cached success', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => '<html>error</html>',
  }));
  expect(await checkForUpdates()).toBe(UpdateStatus.FETCH_FAILED);
  global.fetch.mockImplementation(async () => ({
    ok: true,
    text: async () => CURRENT_VERSION,
  }));
  expect(await checkForUpdates()).toBe(UpdateStatus.NO_UPDATE);
  expect(fetch).toHaveBeenCalledTimes(3);
});
