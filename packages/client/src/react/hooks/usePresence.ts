import { useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent } from 'sockr-shared';

interface UsePresenceReturn {
  onlineUsers: Set<string>;
  isUserOnline: (userId: string) => boolean;
  checkOnlineStatus: (userIds: string[]) => void;
}

export const usePresence = (): UsePresenceReturn => {
  const { client } = useSocket();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const isUserOnline = useCallback(
    (userId: string) => {
      return onlineUsers.has(userId);
    },
    [onlineUsers]
  );

  const checkOnlineStatus = useCallback(
    (userIds: string[]) => {
      if (!client) return;
      client.getOnlineStatus(userIds);
    },
    [client]
  );

  // Listen for user online events
  useSocketEvent(
    'user_online',
    (data: EventPayloads[SocketEvent.USER_ONLINE]) => {
      setOnlineUsers((prev) => new Set(prev).add(data.userId));
    }
  );

  // Listen for user offline events
  useSocketEvent(
    'user_offline',
    (data: EventPayloads[SocketEvent.USER_OFFLINE]) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(data.userId);
        return next;
      });
    }
  );

  // Listen for online status responses
  useSocketEvent(
    'online_status',
    (data: EventPayloads[SocketEvent.ONLINE_STATUS]) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        Object.entries(data.statuses).forEach(([userId, isOnline]) => {
          if (isOnline) {
            next.add(userId);
          } else {
            next.delete(userId);
          }
        });
        return next;
      });
    }
  );

  return {
    onlineUsers,
    isUserOnline,
    checkOnlineStatus,
  };
};