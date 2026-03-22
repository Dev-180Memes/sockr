import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent, Group } from 'sockr-shared';

interface UseUserGroupsReturn {
  groups: Group[];
  isLoading: boolean;
  refresh: () => void;
  createGroup: (name: string, members?: string[], metadata?: Record<string, any>) => void;
}

/**
 * Returns the list of groups the authenticated user belongs to.
 * Automatically refreshes when groups are created or left.
 *
 * Usage:
 *   const { groups, createGroup } = useUserGroups()
 */
export const useUserGroups = (): UseUserGroupsReturn => {
  const { client } = useSocket();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useSocketEvent(
    'user_groups',
    (data: EventPayloads[SocketEvent.USER_GROUPS]) => {
      setIsLoading(false);
      setGroups(data.groups);
    }
  );

  // When a new group is created by this user, add it to the list
  useSocketEvent(
    'group_created',
    (data: EventPayloads[SocketEvent.GROUP_CREATED]) => {
      setGroups((prev) => {
        if (prev.some((g) => g.id === data.group.id)) return prev;
        return [...prev, data.group];
      });
    }
  );

  // When this user joins a group, add it
  useSocketEvent(
    'group_joined',
    (data: EventPayloads[SocketEvent.GROUP_JOINED]) => {
      setGroups((prev) => {
        if (prev.some((g) => g.id === data.groupId)) return prev;
        return [...prev, data.group];
      });
    }
  );

  // When this user leaves a group, remove it
  useSocketEvent(
    'group_left',
    (data: EventPayloads[SocketEvent.GROUP_LEFT]) => {
      setGroups((prev) => prev.filter((g) => g.id !== data.groupId));
    }
  );

  const refresh = useCallback(() => {
    if (!client) return;
    setIsLoading(true);
    client.getUserGroups();
  }, [client]);

  const createGroup = useCallback(
    (name: string, members: string[] = [], metadata?: Record<string, any>) => {
      if (!client) return;
      client.createGroup(name, members, metadata);
    },
    [client]
  );

  // Fetch on mount
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { groups, isLoading, refresh, createGroup };
};