import { cacheStore } from './redis';
import { logger } from './logger';

/**
 * High-level cache wrapper.
 * Uses redis.ts (which falls back to in-memory LRU when Redis is unavailable).
 *
 * Services should import from here, not from redis.ts directly.
 */
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  getRaw(key: string): Promise<string | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  setRaw(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /**
   * Read-through helper: returns cached value if present, else calls loader(),
   * caches the result, and returns it.
   */
  getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T>;
  /**
   * Invalidate keys matching a Redis glob pattern (e.g. "customers:*").
   */
  invalidatePattern(pattern: string): Promise<void>;
}

class CacheServiceImpl implements CacheService {
  async get<T>(key: string): Promise<T | null> {
    const raw = await cacheStore.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async getRaw(key: string): Promise<string | null> {
    return cacheStore.get(key);
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      await cacheStore.set(key, raw, ttlSeconds);
    } catch (err) {
      logger.child({ lib: 'cache' }).debug(
        { err: (err as Error).message, key },
        'cache.set failed (non-fatal)',
      );
    }
  }

  async setRaw(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await cacheStore.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await cacheStore.del(key);
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await loader();
    await this.set<T>(key, fresh, ttlSeconds);
    return fresh;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await cacheStore.keys(pattern);
      await Promise.all(keys.map((k) => cacheStore.del(k)));
    } catch (err) {
      logger.child({ lib: 'cache' }).debug(
        { err: (err as Error).message, pattern },
        'cache.invalidatePattern failed (non-fatal)',
      );
    }
  }
}

export const cache: CacheService = new CacheServiceImpl();

// Re-export common TTLs for consistency.
export const TTL = {
  SHORT: 30, // 30s
  MEDIUM: 300, // 5min
  LONG: 3_600, // 1h
  XLONG: 86_400, // 1d
} as const;
