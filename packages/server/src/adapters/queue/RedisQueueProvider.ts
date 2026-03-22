import type { IQueueProvider } from 'sockr-shared';
import type { PersistedMessage } from 'sockr-shared';

export interface RedisQueueProviderConfig {
  /** Redis connection URL e.g. redis://localhost:6379 */
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  /** Redis DB index. Defaults to 0. */
  db?: number;
  /** Key prefix for all queue keys. Defaults to 'sockr:queue:'. */
  keyPrefix?: string;
  /**
   * TTL in seconds for queued messages.
   * Messages older than this are automatically expired by Redis.
   * Defaults to 7 days (604800 seconds).
   */
  messageTTL?: number;
  /**
   * Pass an existing ioredis client — Sockr will not create a new one.
   * Useful when your app already manages a Redis connection.
   */
  client?: any;
}

/**
 * Redis implementation of IQueueProvider.
 *
 * Requires ioredis to be installed:
 *   npm install ioredis
 *
 * Each user's queue is stored as a Redis List at key `sockr:queue:{userId}`.
 * Messages are JSON-serialized and stored in FIFO order.
 * The entire list is flushed atomically when a user reconnects.
 *
 * Usage:
 *   new SocketServer({
 *     providers: {
 *       queue: new RedisQueueProvider({ url: process.env.REDIS_URL })
 *     }
 *   })
 */
export class RedisQueueProvider implements IQueueProvider {
  private client: any = null;
  private ownClient: boolean = false;
  private prefix: string;
  private messageTTL: number;
  private config: RedisQueueProviderConfig;

  constructor(config: RedisQueueProviderConfig = {}) {
    this.config = config;
    this.prefix = config.keyPrefix ?? 'sockr:queue:';
    this.messageTTL = config.messageTTL ?? 604800; // 7 days
  }

  private key(userId: string): string {
    return `${this.prefix}${userId}`;
  }

  async connect(): Promise<void> {
    if (this.config.client) {
      this.client = this.config.client;
      this.ownClient = false;
      return;
    }

    let Redis: any;
    try {
      Redis = require('ioredis');
    } catch {
      throw new Error(
        '[Sockr] RedisQueueProvider requires ioredis to be installed.\n' +
        'Run: npm install ioredis'
      );
    }

    this.client = this.config.url
      ? new Redis(this.config.url)
      : new Redis({
          host: this.config.host || 'localhost',
          port: this.config.port || 6379,
          password: this.config.password,
          db: this.config.db || 0,
        });

    this.ownClient = true;
  }

  private ensureConnected(): void {
    if (!this.client) {
      throw new Error('[Sockr] RedisQueueProvider not connected.');
    }
  }

  async enqueue(userId: string, message: PersistedMessage): Promise<void> {
    this.ensureConnected();
    const k = this.key(userId);
    const pipeline = this.client.pipeline();
    pipeline.rpush(k, JSON.stringify(message));
    pipeline.expire(k, this.messageTTL);
    await pipeline.exec();
  }

  async dequeue(userId: string): Promise<PersistedMessage[]> {
    this.ensureConnected();
    const k = this.key(userId);
    // Atomically get all items and delete the list
    const pipeline = this.client.pipeline();
    pipeline.lrange(k, 0, -1);
    pipeline.del(k);
    const results = await pipeline.exec();
    const items: string[] = results[0][1] || [];
    return items.map((item) => JSON.parse(item));
  }

  async acknowledge(userId: string, messageId: string): Promise<void> {
    this.ensureConnected();
    // Redis LREM removes matching elements from the list
    // We need to find and remove the serialized message matching this ID.
    // Since we can't search by field, we fetch, filter, and rewrite.
    // For production at scale, consider a different data structure (sorted set).
    const k = this.key(userId);
    const items: string[] = await this.client.lrange(k, 0, -1);
    const updated = items.filter((item) => {
      try {
        return JSON.parse(item).id !== messageId;
      } catch {
        return true;
      }
    });
    if (updated.length === items.length) return; // nothing removed
    const pipeline = this.client.pipeline();
    pipeline.del(k);
    if (updated.length > 0) {
      pipeline.rpush(k, ...updated);
      pipeline.expire(k, this.messageTTL);
    }
    await pipeline.exec();
  }

  async queueLength(userId: string): Promise<number> {
    this.ensureConnected();
    return this.client.llen(this.key(userId));
  }

  async disconnect(): Promise<void> {
    if (this.client && this.ownClient) {
      await this.client.quit();
    }
  }
}