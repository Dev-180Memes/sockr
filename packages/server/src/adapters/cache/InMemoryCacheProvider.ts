import type { ICacheProvider } from "sockr-shared";

/**
 * In-memory implementation of ICacheProvider.
 *
 * WARNING: Single-instance only. Does not work across multiple server
 * processes. Use RedisCacheProvider in production or clustered environments.
 */
export class InMemoryCacheProvider implements ICacheProvider {
  private store: Map<string, { value: string; expiresAt?: number }> = new Map();
  private sets: Map<string, Set<string>> = new Map();

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Sockr] InMemoryCacheProvider is active in production. ' +
        'This will not work correctly across multiple server instances. ' +
        'Pass a cache provider to SocketServer to silence this warning.'
      );
    }
  }

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry || !entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) {
      this.store.delete(key);
      return null;
    }
    return this.store.get(key)?.value || null;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    const set = this.sets.get(key) || new Set<string>();
    members.forEach((m) => set.add(m));
    this.sets.set(key, set);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    const set = this.sets.get(key);
    if (!set) return;
    members.forEach((m) => set.delete(m));
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) || []);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return this.sets.get(key)?.has(member) || false;
  }
}