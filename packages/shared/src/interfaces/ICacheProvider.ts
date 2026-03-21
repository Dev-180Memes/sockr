/**
 * Cache and set operations contract.
 *
 * Used for group membership tracking and presence.
 * The built-in RedisCacheProvider implements this with ioredis.
 * Implement this interface to use Memcached, DynamoDB, or any other store.
 */
export interface ICacheProvider {
  // ─── Key / value ──────────────────────────────────────────────────────────

  /** Set a key with an optional TTL in seconds. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;

  /** Get a value by key. Returns null if the key does not exist. */
  get(key: string): Promise<string | null>;

  /** Delete a key. */
  del(key: string): Promise<void>;

  // ─── Set operations (used for group membership) ───────────────────────────

  /** Add one or more members to a set. Creates the set if it doesn't exist. */
  sadd(key: string, ...members: string[]): Promise<void>;

  /** Remove one or more members from a set. */
  srem(key: string, ...members: string[]): Promise<void>;

  /** Return all members of a set. Returns empty array if key doesn't exist. */
  smembers(key: string): Promise<string[]>;

  /** Return whether a value is a member of a set. */
  sismember(key: string, member: string): Promise<boolean>;
}