export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  delivered: boolean;
  metadata?: Record<string, any>;
}

export interface MessageOptions {
  requireAcknowledgment?: boolean;
  timeout?: number;
}

/**
 * Unified persisted message shape used by IMessageStore.
 * converstaionId:
 *  - 1:1 messages: sorted `${userA}:${userB}` - deterministic regardless of sender
 *  - group messages: the groupId
 */
export interface PersistedMessage {
  id: string;
  conversationId: string;
  from: string;
  to?: string; // set for 1:1 messages
  groupId?: string; // set for group messages
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
  deliveredTo: string[];
  readBy: string[];
}

export interface PaginationOpts {
  limit: number;
  before?: number;
  after?: number;
}