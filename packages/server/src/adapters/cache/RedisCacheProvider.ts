import type { ICacheProvider } from 'sockr-shared';

export interface RedisCacheProviderConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  /** Key prefix for all cache keys. Defaults to 'sockr:cache:'. */
  keyPrefix?: string;
  /** Pass an existing ioredis client — Sockr will not create a new one. */
  client?: any;
}

/**
 * Redis implementation of ICacheProvider.
 *
 * Requires ioredis to be installed:
 *   npm install ioredis
 *
 * Can share the same Redis instance as RedisQueueProvider —
 * they use different key prefixes so there is no collision.
 *
 * Usage:
 *   const redis = new Redis(process.env.REDIS_URL)
 *
 *   new SocketServer({
 *     providers: {
 *       queue: new RedisQueueProvider({ client: redis }),
 *       cache: new RedisCacheProvider({ client: redis }),   // same instance
 *     }
 *   })
 */
export class RedisCacheProvider implements ICacheProvider {
  private client: any = null;
  private ownClient: boolean = false;
  private prefix: string;
  private config: RedisCacheProviderConfig;

  constructor(config: RedisCacheProviderConfig = {}) {
    this.config = config;
    this.prefix = config.keyPrefix ?? 'sockr:cache:';
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
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
        '[Sockr] RedisCacheProvider requires ioredis to be installed.\n' +
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
      throw new Error('[Sockr] RedisCacheProvider not connected.');
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.ensureConnected();
    if (ttlSeconds) {
      await this.client.set(this.k(key), value, 'EX', ttlSeconds);
    } else {
      await this.client.set(this.k(key), value);
    }
  }

  async get(key: string): Promise<string | null> {
    this.ensureConnected();
    return this.client.get(this.k(key));
  }

  async del(key: string): Promise<void> {
    this.ensureConnected();
    await this.client.del(this.k(key));
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    this.ensureConnected();
    await this.client.sadd(this.k(key), ...members);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    this.ensureConnected();
    await this.client.srem(this.k(key), ...members);
  }

  async smembers(key: string): Promise<string[]> {
    this.ensureConnected();
    return this.client.smembers(this.k(key));
  }

  async sismember(key: string, member: string): Promise<boolean> {
    this.ensureConnected();
    const result = await this.client.sismember(this.k(key), member);
    return result === 1;
  }

  async disconnect(): Promise<void> {
    if (this.client && this.ownClient) {
      await this.client.quit();
    }
  }
}