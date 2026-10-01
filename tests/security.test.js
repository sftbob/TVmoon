/** @jest-environment ./tests/node-environment.cjs */
const { webcrypto } = require('crypto');
const { NextRequest } = require('next/server');
const {
  createSession,
  verifySession,
  SESSION_MAX_AGE,
} = require('@/lib/session');
const { middleware } = require('@/middleware');
const { POST: login } = require('@/app/api/login/route');
const { POST: logout } = require('@/app/api/logout/route');
const { GET: cron } = require('@/app/api/cron/route');
const { GET: adminConfig } = require('@/app/api/admin/config/route');

jest.mock('@/lib/config', () => ({ getConfig: jest.fn() }));
jest.mock('@/lib/db', () => ({
  db: { verifyUser: jest.fn(), getAllUsers: jest.fn() },
}));
jest.mock('@/lib/fetchVideoDetail', () => ({ fetchVideoDetail: jest.fn() }));
const { getConfig } = require('@/lib/config');
const { db } = require('@/lib/db');
const secret = 'test-secret-not-a-production-password';
const originalEnv = { ...process.env };

function request(path, cookie, method = 'GET', body) {
  return new NextRequest(`https://example.test${path}`, {
    method,
    headers: cookie ? { cookie: `auth=${cookie}` } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
});
beforeEach(() => {
  process.env.PASSWORD = secret;
  process.env.USERNAME = 'owner';
  process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';
  delete process.env.CRON_SECRET;
  getConfig.mockResolvedValue({
    UserConfig: { Users: [{ username: 'alice', role: 'user' }] },
  });
  db.verifyUser.mockResolvedValue(true);
  jest.clearAllMocks();
});
afterAll(() => {
  process.env = originalEnv;
});

test('local login never stores a password and issues an HttpOnly secure session', async () => {
  const response = await login(
    request('/api/login', null, 'POST', { password: secret })
  );
  expect(response.status).toBe(200);
  const auth = response.cookies.get('auth');
  expect(auth.httpOnly).toBe(true);
  expect(auth.secure).toBe(true);
  expect(decodeURIComponent(auth.value)).not.toContain(secret);
  expect(JSON.parse(decodeURIComponent(auth.value)).password).toBeUndefined();
  expect(
    await verifySession(auth.value, secret, 'localstorage')
  ).not.toBeNull();
  expect(response.cookies.get('auth_info').httpOnly).toBe(false);
});
test('missing deployment password fails closed', async () => {
  delete process.env.PASSWORD;
  expect(
    (await login(request('/api/login', null, 'POST', { password: secret })))
      .status
  ).toBe(503);
});
test('wrong password issues no session', async () => {
  const response = await login(
    request('/api/login', null, 'POST', { password: 'wrong' })
  );
  expect(response.status).toBe(401);
  expect(response.cookies.get('auth')).toBeUndefined();
});
test('database owner and ordinary logins issue signed identities without user passwords', async () => {
  process.env.NEXT_PUBLIC_STORAGE_TYPE = 'upstash';
  for (const [username, password, role] of [
    ['owner', secret, 'owner'],
    ['alice', 'user-password', 'user'],
  ]) {
    const response = await login(
      request('/api/login', null, 'POST', { username, password })
    );
    expect(response.status).toBe(200);
    const value = response.cookies.get('auth').value;
    expect(await verifySession(value, secret, 'upstash')).toMatchObject({
      username,
      role,
    });
    expect(decodeURIComponent(value)).not.toContain(password);
  }
});
test('banned users receive no session', async () => {
  process.env.NEXT_PUBLIC_STORAGE_TYPE = 'upstash';
  getConfig.mockResolvedValueOnce({
    UserConfig: { Users: [{ username: 'alice', role: 'user', banned: true }] },
  });
  const response = await login(
    request('/api/login', null, 'POST', {
      username: 'alice',
      password: 'user-password',
    })
  );
  expect(response.status).toBe(401);
  expect(response.cookies.get('auth')).toBeUndefined();
});
test('claims, expiry, storage mode and signing password cannot be changed', async () => {
  const value = await createSession(secret, 'upstash', 'alice', 'user');
  for (const change of [
    { username: 'owner' },
    { role: 'owner' },
    { expiresAt: Date.now() + 100000 },
  ]) {
    const forged = encodeURIComponent(
      JSON.stringify({ ...JSON.parse(decodeURIComponent(value)), ...change })
    );
    expect(await verifySession(forged, secret, 'upstash')).toBeNull();
  }
  expect(await verifySession(value, 'changed-secret', 'upstash')).toBeNull();
  expect(await verifySession(value, secret, 'localstorage')).toBeNull();
  expect(
    await verifySession(
      value,
      secret,
      'upstash',
      Date.now() + SESSION_MAX_AGE * 1000 + 1
    )
  ).toBeNull();
  expect(await verifySession('malformed', secret, 'upstash')).toBeNull();
});
test('legacy password cookies and display cookies never authorize a request', async () => {
  const legacy = encodeURIComponent(JSON.stringify({ password: secret }));
  expect((await middleware(request('/api/search', legacy))).status).toBe(401);
  const display = new NextRequest('https://example.test/api/admin/config', {
    headers: { cookie: 'auth_info=%7B%22role%22%3A%22owner%22%7D' },
  });
  process.env.NEXT_PUBLIC_STORAGE_TYPE = 'upstash';
  expect((await adminConfig(display)).status).toBe(401);
});
test('valid sessions allow protected pages; similar public URL prefixes remain protected', async () => {
  const value = await createSession(secret, 'localstorage');
  expect((await middleware(request('/', value))).status).toBe(200);
  expect((await middleware(request('/api/login-other'))).status).toBe(401);
  expect(
    (await middleware(request('/search'))).headers.get('location')
  ).toContain('/login?redirect=');
});
test('non-admin signed sessions cannot read admin configuration, even without middleware', async () => {
  process.env.NEXT_PUBLIC_STORAGE_TYPE = 'upstash';
  const value = await createSession(secret, 'upstash', 'alice', 'user');
  expect((await adminConfig(request('/api/admin/config', value))).status).toBe(
    401
  );
  const owner = await createSession(secret, 'upstash', 'owner', 'owner');
  expect((await adminConfig(request('/api/admin/config', owner))).status).toBe(
    200
  );
});
test('cross-origin login mutations are rejected', async () => {
  const req = new NextRequest('https://example.test/api/login', {
    method: 'POST',
    headers: { origin: 'https://other.test' },
  });
  expect((await middleware(req)).status).toBe(403);
});
test('cron denies missing or wrong secrets and allows configured authenticated calls', async () => {
  expect((await cron(request('/api/cron'))).status).toBe(401);
  process.env.CRON_SECRET = 'cron-test-secret';
  expect((await cron(request('/api/cron'))).status).toBe(401);
  const req = new NextRequest('https://example.test/api/cron', {
    headers: { authorization: 'Bearer cron-test-secret' },
  });
  expect((await cron(req)).status).toBe(200);
});
test('logout clears both the credential and display cookies', async () => {
  const response = await logout(request('/api/logout', null, 'POST'));
  expect(response.cookies.get('auth').maxAge).toBe(0);
  expect(response.cookies.get('auth_info').maxAge).toBe(0);
});
