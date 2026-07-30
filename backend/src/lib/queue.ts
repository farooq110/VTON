import { Queue } from 'bullmq';
import { getRedisClient, isUsingFallback } from './redis';
import { config } from '../config';
import { logger } from './logger';

/**
 * BullMQ queue setup.
 *
 * If Redis is unavailable, queues gracefully no-op: `add()` calls return a
 * fake Job object and never throw. A background worker (started in app boot)
 * processes jobs when Redis is available.
 */

export const QUEUE_NAMES = {
  INVOICE: 'invoice-generation',
  EMAIL: 'email-sending',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

interface FakeJob<T = unknown> {
  id: string;
  data: T;
  name: string;
  fake: true;
}

let _invoiceQueue: Queue | null = null;
let _emailQueue: Queue | null = null;
let _initialized = false;

function initQueues(): void {
  if (_initialized) return;
  const conn = getRedisClient();
  if (!conn) {
    logger
      .child({ lib: 'queue' })
      .warn('Redis unavailable — BullMQ queues are running in no-op mode');
    _initialized = true;
    return;
  }
  try {
    // Pass the Redis URL directly to BullMQ so it creates its own connection.
    // (Sharing the live client would require casting across two structurally
    // — but not nominally — compatible ioredis type trees.)
    const connection = { url: config.redis.url };
    _invoiceQueue = new Queue(QUEUE_NAMES.INVOICE, { connection });
    _emailQueue = new Queue(QUEUE_NAMES.EMAIL, { connection });
    _initialized = true;
    logger.child({ lib: 'queue' }).info('BullMQ queues initialized');
  } catch (err) {
    logger.child({ lib: 'queue' }).warn(
      { err: (err as Error).message },
      'BullMQ init failed — queues in no-op mode',
    );
    _initialized = true;
  }
}

function fakeJob<T>(name: string, data: T): FakeJob<T> {
  return {
    id: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    data,
    fake: true as const,
  };
}

export interface QueueService {
  enqueueInvoice(payload: unknown): Promise<unknown>;
  enqueueEmail(payload: unknown): Promise<unknown>;
  isAvailable(): boolean;
}

class QueueServiceImpl implements QueueService {
  async enqueueInvoice(payload: unknown): Promise<unknown> {
    initQueues();
    if (!_invoiceQueue) {
      logger
        .child({ lib: 'queue' })
        .debug({ payload }, 'enqueue.invoice (no-op)');
      return fakeJob(QUEUE_NAMES.INVOICE, payload);
    }
    try {
      return await _invoiceQueue.add('generate', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      });
    } catch (err) {
      logger.child({ lib: 'queue' }).warn(
        { err: (err as Error).message },
        'enqueue.invoice failed (no-op)',
      );
      return fakeJob(QUEUE_NAMES.INVOICE, payload);
    }
  }

  async enqueueEmail(payload: unknown): Promise<unknown> {
    initQueues();
    if (!_emailQueue) {
      logger
        .child({ lib: 'queue' })
        .debug({ payload }, 'enqueue.email (no-op)');
      return fakeJob(QUEUE_NAMES.EMAIL, payload);
    }
    try {
      return await _emailQueue.add('send', payload, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      });
    } catch (err) {
      logger.child({ lib: 'queue' }).warn(
        { err: (err as Error).message },
        'enqueue.email failed (no-op)',
      );
      return fakeJob(QUEUE_NAMES.EMAIL, payload);
    }
  }

  isAvailable(): boolean {
    return !_initialized ? false : _invoiceQueue !== null && !isUsingFallback();
  }
}

export const queue: QueueService = new QueueServiceImpl();

/** Returns the underlying BullMQ queues (null if in no-op mode). For workers. */
export function getQueues(): { invoice: Queue | null; email: Queue | null } {
  initQueues();
  return { invoice: _invoiceQueue, email: _emailQueue };
}
