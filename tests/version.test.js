/** @jest-environment ./tests/node-environment.cjs */
const fs = require('fs');
const path = require('path');
const {
  CURRENT_VERSION,
  checkForUpdates,
  UpdateStatus,
} = require('@/lib/version');
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
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
