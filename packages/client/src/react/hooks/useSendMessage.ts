import { useCallback, useState } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent } from 'sockr-shared';

interface UseSendMessageReturn {
  sendMessage: (to: string, content: string, metadata?: Record<string, any>) => void;
  isSending: boolean;
  error: string | null;
}

export const useSendMessage = (): UseSendMessageReturn => {
  const { client, isAuthenticated } = useSocket();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<Set<string>>(new Set());

  const sendMessage = useCallback(
    (to: string, content: string, metadata?: Record<string, any>) => {
      if (!client || !isAuthenticated) {
        setError('Not authenticated');
        return;
      }

      setIsSending(true);
      setError(null);

      try {
        client.sendMessage(to, content, metadata);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        setIsSending(false);
      }
    },
    [client, isAuthenticated]
  );

  // Listen for message delivery confirmation
  useSocketEvent(
    'message_delivered',
    (data: EventPayloads[SocketEvent.MESSAGE_DELIVERED]) => {
      setIsSending(false);
      setError(null);
    }
  );

  // Listen for message errors
  useSocketEvent(
    'message_error',
    (data: EventPayloads[SocketEvent.MESSAGE_ERROR]) => {
      setIsSending(false);
      setError(data.error);
    }
  );

  return {
    sendMessage,
    isSending,
    error,
  };
};