import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent, Group, GroupMember } from 'sockr-shared';

interface UseGroupReturn {
  /** Full group object, null until loaded */
  group: Group | null;
  members: GroupMember[];
  isJoined: boolean;
  join: () => void;
  leave: () => void;
  refreshMembers: () => void;
}

/**
 * Manages membership state for a single group.
 *
 * Usage:
 *   const { group, members, join, leave } = useGroup('group-id-123')
 */
export const useGroup = (groupId: string): UseGroupReturn => {
  const { client } = useSocket();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isJoined, setIsJoined] = useState(false);

  // Successfully joined
  useSocketEvent(
    'group_joined',
    (data: EventPayloads[SocketEvent.GROUP_JOINED]) => {
      if (data.groupId !== groupId) return;
      setGroup(data.group);
      setIsJoined(true);
    }
  );

  // Left the group
  useSocketEvent(
    'group_left',
    (data: EventPayloads[SocketEvent.GROUP_LEFT]) => {
      if (data.groupId !== groupId) return;
      setIsJoined(false);
      setGroup(null);
      setMembers([]);
    }
  );

  // Members list response
  useSocketEvent(
    'group_members',
    (data: EventPayloads[SocketEvent.GROUP_MEMBERS]) => {
      if (data.groupId !== groupId) return;
      setMembers(data.members);
    }
  );

  // Someone joined the group
  useSocketEvent(
    'group_member_joined',
    (data: EventPayloads[SocketEvent.GROUP_MEMBER_JOINED]) => {
      if (data.groupId !== groupId) return;
      setMembers((prev) => {
        if (prev.some((m) => m.userId === data.member.userId)) return prev;
        return [...prev, data.member];
      });
      setGroup((prev) =>
        prev && !prev.members.includes(data.member.userId)
          ? { ...prev, members: [...prev.members, data.member.userId] }
          : prev
      );
    }
  );

  // Someone left the group
  useSocketEvent(
    'group_member_left',
    (data: EventPayloads[SocketEvent.GROUP_MEMBER_LEFT]) => {
      if (data.groupId !== groupId) return;
      setMembers((prev) => prev.filter((m) => m.userId !== data.userId));
      setGroup((prev) =>
        prev
          ? { ...prev, members: prev.members.filter((id) => id !== data.userId) }
          : prev
      );
    }
  );

  const join = useCallback(() => {
    if (!client) return;
    client.joinGroup(groupId);
  }, [client, groupId]);

  const leave = useCallback(() => {
    if (!client) return;
    client.leaveGroup(groupId);
  }, [client, groupId]);

  const refreshMembers = useCallback(() => {
    if (!client) return;
    client.getGroupMembers(groupId);
  }, [client, groupId]);

  // Fetch members once we're joined
  useEffect(() => {
    if (isJoined) refreshMembers();
  }, [isJoined, refreshMembers]);

  return { group, members, isJoined, join, leave, refreshMembers };
};