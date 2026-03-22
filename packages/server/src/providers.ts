import type { IMessageStore } from 'sockr-shared';
import type { IQueueProvider } from 'sockr-shared';
import type { ICacheProvider } from 'sockr-shared';
import { InMemoryMessageStore } from './adapters/db/InMemoryMessageStore';
import { InMemoryQueueProvider } from './adapters/queue/InMemoryQueueProvider';
import { InMemoryCacheProvider } from './adapters/cache/InMemoryCacheProvider';

export interface ResolvedProviders {
  messageStore: IMessageStore;
  queue: IQueueProvider;
  cache: ICacheProvider;
}

const MESSAGE_STORE_METHODS: (keyof IMessageStore)[] = [
  'saveMessage', 'getMessage', 'getMessages', 'getUndeliveredMessages',
  'markDelivered', 'markRead', 'saveGroup', 'getGroup', 'updateGroup',
  'deleteGroup', 'addGroupMember', 'removeGroupMember', 'getGroupMembers',
  'getUserGroups',
];

const QUEUE_METHODS: (keyof IQueueProvider)[] = [
  'enqueue', 'dequeue', 'acknowledge', 'queueLength',
];

const CACHE_METHODS: (keyof ICacheProvider)[] = [
  'set', 'get', 'del', 'sadd', 'srem', 'smembers', 'sismember',
];

function validateInterface<T extends object>(
  impl: T,
  requiredMethods: (keyof T)[],
  interfaceName: string
): void {
  for (const method of requiredMethods) {
    if (typeof (impl as any)[method] !== 'function') {
      throw new Error(
        `[Sockr] Custom ${interfaceName} is missing required method: "${String(method)}". ` +
        `Implement the ${interfaceName} interface from 'sockr-shared'.`
      );
    }
  }
}

/**
 * Resolves provider config into concrete instances.
 * Falls back to in-memory implementations when a provider is not supplied.
 * Validates custom implementations against the required interface shape.
 */
export function resolveProviders(
  providers?: {
    messageStore?: IMessageStore;
    queue?: IQueueProvider;
    cache?: ICacheProvider;
  }
): ResolvedProviders {
  let messageStore: IMessageStore;
  let queue: IQueueProvider;
  let cache: ICacheProvider;

  if (providers?.messageStore) {
    validateInterface(providers.messageStore, MESSAGE_STORE_METHODS, 'IMessageStore');
    messageStore = providers.messageStore;
  } else {
    messageStore = new InMemoryMessageStore();
  }

  if (providers?.queue) {
    validateInterface(providers.queue, QUEUE_METHODS, 'IQueueProvider');
    queue = providers.queue;
  } else {
    queue = new InMemoryQueueProvider();
  }

  if (providers?.cache) {
    validateInterface(providers.cache, CACHE_METHODS, 'ICacheProvider');
    cache = providers.cache;
  } else {
    cache = new InMemoryCacheProvider();
  }

  return { messageStore, queue, cache };
}

/**
 * Connects all providers that expose a connect() method.
 * Built-in adapters (Mongo, Postgres, MySQL, Redis) require connect()
 * to be called before use. In-memory adapters are no-ops.
 */
export async function connectProviders(providers: ResolvedProviders): Promise<void> {
  const connectables = [
    providers.messageStore,
    providers.queue,
    providers.cache,
  ] as any[];

  await Promise.all(
    connectables
      .filter((p) => typeof p.connect === 'function')
      .map((p) => p.connect())
  );
}

/**
 * Gracefully disconnects all providers that expose a disconnect() method.
 */
export async function disconnectProviders(providers: ResolvedProviders): Promise<void> {
  const connectables = [
    providers.messageStore,
    providers.queue,
    providers.cache,
  ] as any[];

  await Promise.all(
    connectables
      .filter((p) => typeof p.disconnect === 'function')
      .map((p) => p.disconnect())
  );
}