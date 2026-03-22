import type { IQueueProvider } from 'sockr-shared';
import type { PersistedMessage } from 'sockr-shared';

/**
 * In-memory implementation of IQueueProvider.
 *
 * WARNING: Queued messages are lost on restart.
 * Use RedisQueueProvider in production.
 */
export class InMemoryQueueProvider implements IQueueProvider {
  private queues: Map<string, PersistedMessage[]> = new Map();

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Sockr] InMemoryQueueProvider is active in production. ' +
        'Queued messages will not survive restarts. ' +
        'Pass a queue provider to SocketServer to silence this warning.'
      );
    }
  }

  async enqueue(userId: string, message: PersistedMessage): Promise<void> {
    const queue = this.queues.get(userId) || [];
    queue.push(message);
    this.queues.set(userId, queue);
  }

  async dequeue(userId: string): Promise<PersistedMessage[]> {
    const messages = this.queues.get(userId) || [];
    this.queues.set(userId, []);
    return messages;
  }

  async acknowledge(userId: string, messageId: string): Promise<void> {
    const queue = this.queues.get(userId) || [];
    this.queues.set(
      userId,
      queue.filter((m) => m.id !== messageId)
    );
  }

  async queueLength(userId: string): Promise<number> {
    return (this.queues.get(userId) || []).length;
  }
}