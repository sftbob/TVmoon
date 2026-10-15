// Bounded, in-memory cache. Never persist account data or media URLs here.
export function createRequestCache<T>(
  ttlMs: number,
  maxEntries: number,
  canCache: (value: T) => boolean = () => true
): (key: string, load: () => Promise<T>) => Promise<T> {
  const entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();
  return (key, load) => {
    const cached = entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    entries.delete(key);
    // A stalled request must not block retries forever. Refresh the TTL when
    // it succeeds, and let later callers retry if it stays pending too long.
    const entry = {
      promise: null as unknown as Promise<T>,
      expiresAt: Date.now() + ttlMs,
    };
    entry.promise = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (entries.get(key) === entry) {
            if (canCache(value)) entry.expiresAt = Date.now() + ttlMs;
            else entries.delete(key);
          }
          return value;
        },
        (error) => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        }
      );
    entries.set(key, entry);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    return entry.promise;
  };
}
