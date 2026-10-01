const { randomUUID } = require('crypto');
const { sendBatch, probeExtension } = require('@/lib/tvmoon-handoff');
beforeEach(() => { jest.useFakeTimers(); Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID } }); window.postMessage = jest.fn(); });
afterEach(() => jest.useRealTimers());
const request = { version: 1, requestId: 'test', action: 'enqueueBatch', items: [], startAfterEnqueue: true };
function event(overrides = {}) { return new MessageEvent('message', { source: window, origin: location.origin, data: { channel: 'tianding.tvmoon.v1', type: 'response', payload: { version: 1, requestId: 'test', code: 'OK' } }, ...overrides }); }
test('helper verifies window, origin, channel, type, version and request ID before accepting a reply', async () => {
  const promise = sendBatch(request); let settled = false; promise.then(() => { settled = true; });
  for (const bad of [event({ source: null }), event({ origin: 'https://other.example' }), event({ data: { channel: 'wrong' } }), event({ data: { channel: 'tianding.tvmoon.v1', type: 'response', payload: { version: 2, requestId: 'test' } } }), event({ data: { channel: 'tianding.tvmoon.v1', type: 'response', payload: { version: 1, requestId: 'different' } } })]) window.dispatchEvent(bad);
  await Promise.resolve(); expect(settled).toBe(false);
  window.dispatchEvent(event()); expect((await promise).code).toBe('OK');
  expect(window.postMessage).toHaveBeenCalledWith({ channel: 'tianding.tvmoon.v1', type: 'request', payload: request }, location.origin);
});
test('probe waits two seconds, never submits a batch and removes its listener', async () => {
  const remove = jest.spyOn(window, 'removeEventListener'); const promise = probeExtension();
  const assertion = expect(promise).rejects.toThrow('HANDOFF_TIMEOUT');
  jest.advanceTimersByTime(2000); await assertion;
  expect(window.postMessage.mock.calls[0][0].payload.action).toBe('probe');
  expect(remove).toHaveBeenCalledWith('message', expect.any(Function)); remove.mockRestore();
});
