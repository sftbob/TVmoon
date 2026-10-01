export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export interface Session {
  version: 1;
  username?: string;
  role: 'owner' | 'admin' | 'user';
  storageType: string;
  expiresAt: number;
  signature: string;
}

function payload(session: Omit<Session, 'signature'>): string {
  return JSON.stringify([
    'TVmoon/session',
    session.version,
    session.username || '',
    session.role,
    session.storageType,
    session.expiresAt,
  ]);
}

async function key(secret: string, usage: KeyUsage) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

export async function createSession(
  secret: string,
  storageType: string,
  username?: string,
  role: Session['role'] = 'user',
  now = Date.now()
): Promise<string> {
  if (!secret) throw new Error('A session signing secret is required');
  const session: Omit<Session, 'signature'> = {
    version: 1,
    username,
    role,
    storageType,
    expiresAt: now + SESSION_MAX_AGE * 1000,
  };
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret, 'sign'),
    new TextEncoder().encode(payload(session))
  );
  return encodeURIComponent(
    JSON.stringify({
      ...session,
      signature: Array.from(new Uint8Array(signature))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join(''),
    })
  );
}

export async function verifySession(
  value: string | undefined,
  secret: string,
  storageType: string,
  now = Date.now()
): Promise<Session | null> {
  if (!value || !secret) return null;
  try {
    const session: Session = JSON.parse(decodeURIComponent(value));
    if (
      session.version !== 1 ||
      session.storageType !== storageType ||
      !['owner', 'admin', 'user'].includes(session.role) ||
      !Number.isSafeInteger(session.expiresAt) ||
      session.expiresAt <= now ||
      session.expiresAt > now + SESSION_MAX_AGE * 1000 ||
      (session.username !== undefined &&
        typeof session.username !== 'string') ||
      (storageType !== 'localstorage' && !session.username) ||
      typeof session.signature !== 'string' ||
      !/^[0-9a-f]{64}$/.test(session.signature)
    )
      return null;
    const signature = new Uint8Array(
      (session.signature.match(/../g) || []).map((byte) => parseInt(byte, 16))
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key(secret, 'verify'),
      signature,
      new TextEncoder().encode(payload(session))
    );
    return valid ? session : null;
  } catch {
    return null;
  }
}

export function isCronAuthorized(
  authorization: string | null,
  secret?: string
): boolean {
  return Boolean(secret && authorization === `Bearer ${secret}`);
}
