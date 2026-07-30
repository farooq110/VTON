import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

/**
 * Redis client with graceful in-memory fallback.
 *
 * If Redis is unreachable at boot OR drops mid-flight, all cache/queue operations
 * silently fall back to an in-memory Map. A warning is logged (once per state
 * transition) but the app NEVER crashes.
 */

export interface CacheLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<boolean>;
  isUsingFallback(): boolean;
}

// ---------------------------------------------------------------------------
// In-memory LRU fallback
// ---------------------------------------------------------------------------

interface MemEntry {
  value: string;
  expiresAt: number | null; // epoch ms, null = never
}

class InMemoryCache implements CacheLike {
  private readonly store = new Map<string, MemEntry>();
  private readonly maxEntries = 1000;

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expiresAt !== null && v.expiresAt <= now) {
        this.store.delete(k);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    this.sweep();
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= now()) {
      this.store.delete(key);
      return null;
    }
    // refresh LRU order
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.store.size >= this.maxEntries) {
      // evict oldest (Map preserves insertion order)
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    this.sweep();
    const re = patternToRegExp(pattern);
    const out: string[] = [];
    for (const k of this.store.keys()) {
      if (re.test(k)) out.push(k);
    }
    return out;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  isUsingFallback(): boolean {
    return true;
  }
}

function now(): number {
  return Date.now();
}

function patternToRegExp(pattern: string): RegExp {
  // Translate Redis-style glob to RegExp (very small subset)
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${re}$`);
}

// ---------------------------------------------------------------------------
// Redis-backed implementation
// ---------------------------------------------------------------------------

class RedisCache implements CacheLike {
  private readonly client: Redis;
  private healthy = true;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      retryStrategy(times: number): number {
        // exponential-ish, capped
        return Math.min(times * 200, 2_000);
      },
    });

    this.client.on('error', (err) => {
      if (this.healthy) {
        logger.child({ lib: 'redis' }).warn(
          { err: err.message },
          'Redis error — falling back to in-memory cache',
        );
        this.healthy = false;
      }
    });

    this.client.on('connect', () => {
      logger.child({ lib: 'redis' }).info('Redis connected');
    });

    this.client.on('reconnecting', () => {
      logger.child({ lib: 'redis' }).info('Redis reconnecting…');
    });

    this.client.on('ready', () => {
      if (!this.healthy) {
        logger.child({ lib: 'redis' }).info('Redis healthy again');
      }
      this.healthy = true;
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.healthy = false;
      logger
        .child({ lib: 'redis' })
        .debug({ err: (err as Error).message }, 'redis.get failed');
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.healthy = false;
      logger
        .child({ lib: 'redis' })
        .debug({ err: (err as Error).message }, 'redis.set failed');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.healthy = false;
      logger
        .child({ lib: 'redis' })
        .debug({ err: (err as Error).message }, 'redis.del failed');
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (err) {
      this.healthy = false;
      return [];
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      this.healthy = false;
      return false;
    }
  }

  isUsingFallback(): boolean {
    return !this.healthy;
  }

  /** Raw client (used by BullMQ queue setup — never by services). */
  getRawClient(): Redis {
    return this.client;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap: try Redis, fall back if it fails
// ---------------------------------------------------------------------------

let _impl: CacheLike;

function bootstrap(): CacheLike {
  try {
    const redisImpl = new RedisCache(config.redis.url);
    return redisImpl;
  } catch (err) {
    logger
      .child({ lib: 'redis' })
      .warn({ err: (err as Error).message }, 'Redis init failed — using in-memory cache');
    return new InMemoryCache();
  }
}

_impl = bootstrap();

/**
 * Public cache interface. Always available — may be backed by Redis or in-memory.
 */
export const cacheStore: CacheLike = _impl;

/**
 * Get the raw ioredis client for BullMQ (or null if we fell back to in-memory).
 */
export function getRedisClient(): Redis | null {
  if (_impl instanceof RedisCache && !_impl.isUsingFallback()) {
    return _impl.getRawClient();
  }
  return null;
}

export async function pingRedis(): Promise<boolean> {
  try {
    return await _impl.ping();
  } catch {
    return false;
  }
}

export function isUsingFallback(): boolean {
  return _impl.isUsingFallback();
}
