import type { PersistedMessage } from '../types/message';

/**
 * Offline delivery queue contract.
 *
 * The queue is ephemeral by design — once a message is delivered and
 * acknowledged it is removed. Long-term history lives in IMessageStore.
 *
 * The built-in RedisQueueProvider uses a Redis List per user.
 * Implement this interface to use any queue backend (SQS, BullMQ, etc).
 */
export interface IQueueProvider {
  /**
   * Add a message to a user's offline queue.
   * Called when a message cannot be delivered immediately because
   * the target user is not connected.
   */
  enqueue(userId: string, message: PersistedMessage): Promise<void>;

  /**
   * Retrieve and clear all queued messages for a user.
   * Called when the user reconnects and authenticates.
   * Returns messages in FIFO order.
   */
  dequeue(userId: string): Promise<PersistedMessage[]>;

  /**
   * Remove a specific message from a user's queue after confirmed delivery.
   * Used when doing granular per-message acknowledgement.
   */
  acknowledge(userId: string, messageId: string): Promise<void>;

  /**
   * Return the number of messages currently queued for a user.
   * Useful for showing unread counts before full dequeue.
   */
  queueLength(userId: string): Promise<number>;
}