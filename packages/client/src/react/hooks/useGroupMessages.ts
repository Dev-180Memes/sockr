import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent, PersistedMessage } from 'sockr-shared';

interface GroupMessage {
  id: string;
  groupId: string;
  from: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface UseGroupMessagesOptions {
  /** Automatically fetch message history when the hook mounts. Defaults to true. */
  fetchHistory?: boolean;
  /** Number of messages to fetch per page. Defaults to 50. */
  limit?: number;
}

interface UseGroupMessagesReturn {
  messages: GroupMessage[];
  isLoadingHistory: boolean;
  sendMessage: (content: string, metadata?: Record<string, any>) => void;
  markRead: (messageId: string) => void;
  fetchHistory: (before?: number) => void;
  clearMessages: () => void;
}

export const useGroupMessages = (
  groupId: string,
  options: UseGroupMessagesOptions = {}
): UseGroupMessagesReturn => {
  const { fetchHistory: autoFetch = true, limit = 50 } = options;
  const { client } = useSocket();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const addMessage = useCallback((message: GroupMessage) => {
    setMessages((prev) => {
      // Deduplicate by id in case of reconnect replay
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  // Incoming group message
  useSocketEvent(
    'group_message',
    (data: EventPayloads[SocketEvent.GROUP_RECEIVE_MESSAGE]) => {
      if (data.groupId !== groupId) return;
      addMessage({
        id: data.messageId,
        groupId: data.groupId,
        from: data.from,
        content: data.content,
        timestamp: data.timestamp,
        metadata: data.metadata,
      });
    }
  );

  // History response
  useSocketEvent(
    'group_message_history',
    (data: EventPayloads[SocketEvent.GROUP_MESSAGE_HISTORY]) => {
      if (data.groupId !== groupId) return;
      setIsLoadingHistory(false);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const incoming = data.messages
          .filter((m) => !existingIds.has(m.id))
          .map((m) => ({
            id: m.id,
            groupId: m.groupId!,
            from: m.from,
            content: m.content,
            timestamp: m.timestamp,
            metadata: m.metadata,
          }));
        // Prepend history (older messages go before newer ones)
        return [...incoming, ...prev].sort((a, b) => a.timestamp - b.timestamp);
      });
    }
  );

  // Queued messages delivered on GROUP_JOINED
  useSocketEvent(
    'group_joined',
    (data: EventPayloads[SocketEvent.GROUP_JOINED]) => {
      if (data.groupId !== groupId) return;
      const queued = data.queuedMessages || [];
      queued.forEach((m: PersistedMessage) => {
        if (!m.groupId) return;
        addMessage({
          id: m.id,
          groupId: m.groupId,
          from: m.from,
          content: m.content,
          timestamp: m.timestamp,
          metadata: m.metadata,
        });
      });
    }
  );

  const fetchHistory = useCallback(
    (before?: number) => {
      if (!client) return;
      setIsLoadingHistory(true);
      client.getGroupMessageHistory(groupId, { limit, before });
    },
    [client, groupId, limit]
  );

  const sendMessage = useCallback(
    (content: string, metadata?: Record<string, any>) => {
      if (!client) return;
      client.sendGroupMessage(groupId, content, metadata);
    },
    [client, groupId]
  );

  const markRead = useCallback(
    (messageId: string) => {
      if (!client) return;
      client.markGroupMessageRead(groupId, messageId);
    },
    [client, groupId]
  );

  // Auto-fetch history on mount
  useEffect(() => {
    if (autoFetch) fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return { messages, isLoadingHistory, sendMessage, markRead, fetchHistory, clearMessages };
};