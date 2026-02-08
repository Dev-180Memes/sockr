import { useState, useCallback, useEffect, useRef } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent } from 'sockr-shared';

interface UseTypingIndicatorReturn {
  startTyping: (to: string) => void;
  stopTyping: (to: string) => void;
  usersTyping: Set<string>;
}

export const useTypingIndicator = (
  typingTimeout: number = 3000
): UseTypingIndicatorReturn => {
  const { client } = useSocket();
  const [usersTyping, setUsersTyping] = useState<Set<string>>(new Set());
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const startTyping = useCallback(
    (to: string) => {
      if (!client) return;
      client.startTyping(to);
    },
    [client]
  );

  const stopTyping = useCallback(
    (to: string) => {
      if (!client) return;
      client.stopTyping(to);
    },
    [client]
  );

  const clearTypingTimeout = useCallback((userId: string) => {
    const timeout = timeoutsRef.current.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(userId);
    }
  }, []);

  // Listen for typing start
  useSocketEvent(
    'typing_start',
    (data: EventPayloads[SocketEvent.TYPING_START]) => {
      setUsersTyping((prev) => new Set(prev).add(data.from));

      // Clear existing timeout
      clearTypingTimeout(data.from);

      // Set new timeout to automatically remove typing status
      const timeout = setTimeout(() => {
        setUsersTyping((prev) => {
          const next = new Set(prev);
          next.delete(data.from);
          return next;
        });
        timeoutsRef.current.delete(data.from);
      }, typingTimeout);

      timeoutsRef.current.set(data.from, timeout);
    }
  );

  // Listen for typing stop
  useSocketEvent(
    'typing_stop',
    (data: EventPayloads[SocketEvent.TYPING_STOP]) => {
      clearTypingTimeout(data.from);
      setUsersTyping((prev) => {
        const next = new Set(prev);
        next.delete(data.from);
        return next;
      });
    }
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  return {
    startTyping,
    stopTyping,
    usersTyping,
  };
};