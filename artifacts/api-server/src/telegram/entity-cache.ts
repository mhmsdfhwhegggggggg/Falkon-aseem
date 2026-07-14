/**
 * ENTITY CACHE — LRU Cache for Telegram entities
 * ================================================
 * Prevents redundant getEntity() API calls (expensive, rate-limited).
 * Each cached entity has a TTL; after expiry it's re-fetched.
 *
 * Performance impact:
 *   - Without cache: every member lookup = 1 API call
 *   - With cache: target group fetched ONCE per job; member entities cached across jobs
 *   - Expected: 60–80% reduction in redundant API calls
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

class LRUCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // LRU: move to end
    this.map.delete(key);
    entry.hits++;
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.size >= this.maxSize) {
      // Evict oldest (first) entry
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs, hits: 0 });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  stats(): { size: number; maxSize: number; ttlMs: number } {
    return { size: this.map.size, maxSize: this.maxSize, ttlMs: this.ttlMs };
  }
}

// Entity cache: 500 entries, 30min TTL (entities rarely change)
const entityCache = new LRUCache<string, any>(500, 30 * 60 * 1000);

// Negative cache: usernames known to be invalid (5min TTL)
const negativeCache = new LRUCache<string, string>(200, 5 * 60 * 1000);

// ─── Public API ───────────────────────────────────────────────────────────────

export function normalizeKey(target: string): string {
  let k = target.trim().toLowerCase();
  if (k.startsWith("https://t.me/")) k = k.replace("https://t.me/", "");
  if (k.startsWith("t.me/")) k = k.replace("t.me/", "");
  if (k.startsWith("@")) k = k.slice(1);
  return k;
}

export function getCachedEntity(target: string): any | null {
  return entityCache.get(normalizeKey(target));
}

export function setCachedEntity(target: string, entity: any): void {
  entityCache.set(normalizeKey(target), entity);
}

export function markInvalid(target: string, reason: string): void {
  negativeCache.set(normalizeKey(target), reason);
}

export function isKnownInvalid(target: string): string | null {
  return negativeCache.get(normalizeKey(target));
}

export function invalidateEntity(target: string): void {
  entityCache.delete(normalizeKey(target));
}

export function clearAllCaches(): void {
  entityCache.clear();
  negativeCache.clear();
}

export function getCacheStats() {
  return {
    entity: entityCache.stats(),
    negative: negativeCache.stats(),
  };
}

/**
 * Resolve a Telegram entity with caching.
 * Falls back to API call on cache miss.
 */
export async function resolveEntity(
  client: { getEntity: (target: any) => Promise<any> },
  target: string
): Promise<any> {
  const key = normalizeKey(target);

  // Check negative cache first (skip known-invalid fast)
  const invalid = negativeCache.get(key);
  if (invalid) throw new Error(`Cached invalid: ${invalid}`);

  // Check entity cache
  const cached = entityCache.get(key);
  if (cached) return cached;

  // Format target for Telegram
  let formatted = target.trim();
  if (formatted.startsWith("https://t.me/")) formatted = "@" + formatted.replace("https://t.me/", "");
  else if (formatted.startsWith("t.me/")) formatted = "@" + formatted.replace("t.me/", "");
  else if (!formatted.startsWith("@") && !formatted.match(/^\-?\d+$/)) formatted = "@" + formatted;

  try {
    const entity = await client.getEntity(formatted);
    entityCache.set(key, entity);
    return entity;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Cache as invalid if it's definitely wrong (not a transient error)
    if (msg.includes("USERNAME_INVALID") || msg.includes("USERNAME_NOT_OCCUPIED") || msg.includes("USER_ID_INVALID")) {
      negativeCache.set(key, msg);
    }
    throw err;
  }
}
