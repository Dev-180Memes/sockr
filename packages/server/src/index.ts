export { SocketServer } from './core/SocketServer';
export { Connection } from './core/Connection';
export { ConnectionManager } from './core/ConnectionManager';

// Plugins
export { Plugin } from './plugins/Plugin';
export { AuthPlugin } from './plugins/AuthPlugin';
export type { AuthHandler } from './plugins/AuthPlugin';
export { PresencePlugin } from './plugins/PresencePlugin';
export { MessagePlugin } from './plugins/MessagePlugin';
export { GroupPlugin } from './plugins/GroupPlugin';
export { VoicePlugin } from './plugins/VoicePlugin';

// DB adapters
export { MongoMessageStore } from './adapters/db/MongoMessageStore';
export type { MongoMessageStoreConfig } from './adapters/db/MongoMessageStore';
export { PostgresMessageStore } from './adapters/db/PostgresMessageStore';
export type { PostgresMessageStoreConfig } from './adapters/db/PostgresMessageStore';
export { MySQLMessageStore } from './adapters/db/MySQLMessageStore';
export type { MySQLMessageStoreConfig } from './adapters/db/MySQLMessageStore';
export { InMemoryMessageStore } from './adapters/db/InMemoryMessageStore';

// Queue adapters
export { RedisQueueProvider } from './adapters/queue/RedisQueueProvider';
export type { RedisQueueProviderConfig } from './adapters/queue/RedisQueueProvider';
export { InMemoryQueueProvider } from './adapters/queue/InMemoryQueueProvider';

// Cache adapters
export { RedisCacheProvider } from './adapters/cache/RedisCacheProvider';
export type { RedisCacheProviderConfig } from './adapters/cache/RedisCacheProvider';
export { InMemoryCacheProvider } from './adapters/cache/InMemoryCacheProvider';

// Provider utilities (for custom integrations)
export { resolveProviders, connectProviders, disconnectProviders } from './providers';
export type { ResolvedProviders } from './providers';

// Re-export shared types
export * from 'sockr-shared';