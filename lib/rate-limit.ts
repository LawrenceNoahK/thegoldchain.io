// ============================================================
// THE GOLDCHAIN — In-Memory Rate Limiter
// Sliding window rate limiting using a Map
// ============================================================

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

/**
 * Check and apply rate limit for a given key.
 *
 * @param key - Unique identifier (e.g. userId + action)
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { success, remaining, resetAt }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Clean up expired entries across the entire store (lightweight sweep)
  // Only clean a few entries per call to avoid blocking
  let cleanCount = 0;
  const storeKeys = Array.from(store.keys());
  for (let i = 0; i < storeKeys.length && cleanCount < 10; i++) {
    const storeKey = storeKeys[i];
    const storeEntry = store.get(storeKey);
    if (!storeEntry) continue;
    const filtered = storeEntry.timestamps.filter((ts: number) => ts > windowStart);
    if (filtered.length === 0) {
      store.delete(storeKey);
    } else {
      storeEntry.timestamps = filtered;
    }
    cleanCount++;
  }

  // Get or create entry for this key
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Filter out timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Check if limit is exceeded
  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    const resetAt = oldestInWindow + windowMs;
    return {
      success: false,
      remaining: 0,
      resetAt,
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    success: true,
    remaining: limit - entry.timestamps.length,
    resetAt: now + windowMs,
  };
}
