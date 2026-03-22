import { useState, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent } from 'sockr-shared';

interface UseGroupTypingReturn {
  /** UserIds currently typing in this group (excludes the local user) */
  typingMembers: string[];
  startTyping: () => void;
  stopTyping: () => void;
}

/**
 * Tracks typing indicators for a group conversation.
 * Automatically stops typing after `stopDelay` ms of inactivity.
 *
 * Usage:
 *   const { typingMembers, startTyping, stopTyping } = useGroupTyping('group-id-123')
 */
export const useGroupTyping = (
  groupId: string,
  stopDelay: number = 2000
): UseGroupTypingReturn => {
  const { client } = useSocket();
  const [typingMembers, setTypingMembers] = useState<string[]>([]);
  // Map of userId → timeout handle for auto-clearing stale typing indicators
  const typingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isTyping = useRef(false);
  const stopTimer = useRef<NodeJS.Timeout | null>(null);

  useSocketEvent(
    'group_typing_start',
    (data: EventPayloads[SocketEvent.GROUP_TYPING_START]) => {
      if (data.groupId !== groupId) return;

      setTypingMembers((prev) => {
        if (prev.includes(data.from)) return prev;
        return [...prev, data.from];
      });

      // Clear any existing auto-stop timer for this user
      const existing = typingTimers.current.get(data.from);
      if (existing) clearTimeout(existing);

      // Auto-clear if we don't receive a stop event within stopDelay * 2
      const timer = setTimeout(() => {
        setTypingMembers((prev) => prev.filter((id) => id !== data.from));
        typingTimers.current.delete(data.from);
      }, stopDelay * 2);

      typingTimers.current.set(data.from, timer);
    }
  );

  useSocketEvent(
    'group_typing_stop',
    (data: EventPayloads[SocketEvent.GROUP_TYPING_STOP]) => {
      if (data.groupId !== groupId) return;

      const existing = typingTimers.current.get(data.from);
      if (existing) clearTimeout(existing);
      typingTimers.current.delete(data.from);

      setTypingMembers((prev) => prev.filter((id) => id !== data.from));
    }
  );

  const startTyping = useCallback(() => {
    if (!client) return;
    if (!isTyping.current) {
      isTyping.current = true;
      client.startGroupTyping(groupId);
    }

    // Reset the auto-stop timer on each keystroke
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      isTyping.current = false;
      client.stopGroupTyping(groupId);
    }, stopDelay);
  }, [client, groupId, stopDelay]);

  const stopTyping = useCallback(() => {
    if (!client || !isTyping.current) return;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    isTyping.current = false;
    client.stopGroupTyping(groupId);
  }, [client, groupId]);

  return { typingMembers, startTyping, stopTyping };
};