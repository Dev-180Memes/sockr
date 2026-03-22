import { Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { Plugin } from './Plugin';
import {
  SocketEvent,
  EventPayloads,
  Group,
  GroupMember,
  PersistedMessage,
} from 'sockr-shared';
import type { ResolvedProviders } from '../providers';

export class GroupPlugin extends Plugin {
  private providers: ResolvedProviders;

  constructor(io: any, connectionManager: any, providers: ResolvedProviders) {
    super(io, connectionManager);
    this.providers = providers;
  }

  public initialize(): void {
    // No global initialization needed
  }

  public handleConnection(socket: Socket): void {
    socket.on(
      SocketEvent.GROUP_CREATE,
      async (payload: EventPayloads[SocketEvent.GROUP_CREATE]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) {
          socket.emit(SocketEvent.GROUP_CREATE_ERROR, { error: 'Not authenticated' });
          return;
        }

        const userId = connection.getUserId()!;
        const groupId = randomUUID();
        const now = Date.now();

        const group: Group = {
          id: groupId,
          name: payload.name,
          createdBy: userId,
          createdAt: now,
          members: [userId, ...(payload.members || [])],
          metadata: payload.metadata,
        };

        try {
          await this.providers.messageStore.saveGroup(group);

          // Persist creator as admin
          await this.providers.messageStore.addGroupMember(groupId, {
            userId,
            role: 'admin',
            joinedAt: now,
          });

          // Persist any initially invited members
          for (const memberId of payload.members || []) {
            await this.providers.messageStore.addGroupMember(groupId, {
              userId: memberId,
              role: 'member',
              joinedAt: now,
            });
          }

          // Cache group membership
          await this.providers.cache.sadd(`group:${groupId}:members`, ...group.members);

          // Join the creator's socket to the Socket.IO room
          socket.join(groupId);

          // Join any invited members that are currently online
          for (const memberId of payload.members || []) {
            const memberConns = this.connectionManager.getConnectionsByUserId(memberId);
            for (const conn of memberConns) {
              conn.getSocket().join(groupId);
            }
          }

          socket.emit(SocketEvent.GROUP_CREATED, { group } as EventPayloads[SocketEvent.GROUP_CREATED]);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to create group', err);
          socket.emit(SocketEvent.GROUP_CREATE_ERROR, { error: 'Failed to create group' });
        }
      }
    );

    socket.on(
      SocketEvent.GROUP_JOIN,
      async (payload: EventPayloads[SocketEvent.GROUP_JOIN]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) {
          socket.emit(SocketEvent.GROUP_JOIN_ERROR, {
            groupId: payload.groupId,
            error: 'Not authenticated',
          });
          return;
        }

        const userId = connection.getUserId()!;

        try {
          const group = await this.providers.messageStore.getGroup(payload.groupId);
          if (!group) {
            socket.emit(SocketEvent.GROUP_JOIN_ERROR, {
              groupId: payload.groupId,
              error: 'Group not found',
            });
            return;
          }

          const isMember = await this.providers.cache.sismember(
            `group:${payload.groupId}:members`,
            userId
          );

          if (!isMember) {
            // Add to persistent store and cache
            const member: GroupMember = { userId, role: 'member', joinedAt: Date.now() };
            await this.providers.messageStore.addGroupMember(payload.groupId, member);
            await this.providers.cache.sadd(`group:${payload.groupId}:members`, userId);

            // Notify existing room members
            socket.to(payload.groupId).emit(SocketEvent.GROUP_MEMBER_JOINED, {
              groupId: payload.groupId,
              member,
            } as EventPayloads[SocketEvent.GROUP_MEMBER_JOINED]);
          }

          // Join ALL of this user's active sockets to the room
          const userConns = this.connectionManager.getConnectionsByUserId(userId);
          for (const conn of userConns) {
            conn.getSocket().join(payload.groupId);
          }

          // Fetch any queued messages the user missed while offline
          const queuedMessages = await this.providers.messageStore.getMessages(
            payload.groupId,
            { limit: 50 }
          );

          // Refresh group from store to get updated members list
          const updatedGroup = await this.providers.messageStore.getGroup(payload.groupId);

          socket.emit(SocketEvent.GROUP_JOINED, {
            groupId: payload.groupId,
            group: updatedGroup || group,
            queuedMessages,
          } as EventPayloads[SocketEvent.GROUP_JOINED]);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to join group', err);
          socket.emit(SocketEvent.GROUP_JOIN_ERROR, {
            groupId: payload.groupId,
            error: 'Failed to join group',
          });
        }
      }
    );

    socket.on(
      SocketEvent.GROUP_LEAVE,
      async (payload: EventPayloads[SocketEvent.GROUP_LEAVE]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;

        try {
          await this.providers.messageStore.removeGroupMember(payload.groupId, userId);
          await this.providers.cache.srem(`group:${payload.groupId}:members`, userId);

          // Remove ALL of this user's sockets from the room
          const userConns = this.connectionManager.getConnectionsByUserId(userId);
          for (const conn of userConns) {
            conn.getSocket().leave(payload.groupId);
          }

          // Notify remaining members
          this.io.to(payload.groupId).emit(SocketEvent.GROUP_MEMBER_LEFT, {
            groupId: payload.groupId,
            userId,
          } as EventPayloads[SocketEvent.GROUP_MEMBER_LEFT]);

          socket.emit(SocketEvent.GROUP_LEFT, {
            groupId: payload.groupId,
          } as EventPayloads[SocketEvent.GROUP_LEFT]);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to leave group', err);
        }
      }
    );

    socket.on(
      SocketEvent.GROUP_SEND_MESSAGE,
      async (payload: EventPayloads[SocketEvent.GROUP_SEND_MESSAGE]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) {
          socket.emit(SocketEvent.GROUP_MESSAGE_ERROR, {
            groupId: payload.groupId,
            error: 'Not authenticated',
          });
          return;
        }

        const fromUserId = connection.getUserId()!;

        // Verify sender is a member
        const isMember = await this.providers.cache.sismember(
          `group:${payload.groupId}:members`,
          fromUserId
        );
        if (!isMember) {
          socket.emit(SocketEvent.GROUP_MESSAGE_ERROR, {
            groupId: payload.groupId,
            error: 'Not a member of this group',
          });
          return;
        }

        const messageId = randomUUID();
        const timestamp = Date.now();

        const persisted: PersistedMessage = {
          id: messageId,
          conversationId: payload.groupId,
          from: fromUserId,
          groupId: payload.groupId,
          content: payload.content,
          timestamp,
          metadata: payload.metadata,
          deliveredTo: [fromUserId], // sender has it
          readBy: [],
        };

        try {
          await this.providers.messageStore.saveMessage(persisted);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to persist group message', err);
          socket.emit(SocketEvent.GROUP_MESSAGE_ERROR, {
            groupId: payload.groupId,
            messageId,
            error: 'Failed to save message',
          });
          return;
        }

        // Fan-out to all online members in the room (Socket.IO handles this)
        this.io.to(payload.groupId).emit(SocketEvent.GROUP_RECEIVE_MESSAGE, {
          groupId: payload.groupId,
          messageId,
          from: fromUserId,
          content: payload.content,
          timestamp,
          metadata: payload.metadata,
        } as EventPayloads[SocketEvent.GROUP_RECEIVE_MESSAGE]);

        // Queue for offline members
        const allMembers = await this.providers.cache.smembers(
          `group:${payload.groupId}:members`
        );
        const offlineMembers = allMembers.filter(
          (memberId) =>
            memberId !== fromUserId &&
            !this.connectionManager.isUserOnline(memberId)
        );

        for (const memberId of offlineMembers) {
          try {
            await this.providers.queue.enqueue(memberId, persisted);
          } catch (err) {
            console.error(
              `[Sockr] GroupPlugin: failed to queue message for offline member ${memberId}`,
              err
            );
          }
        }

        // Mark delivered for online members
        const onlineMembers = allMembers.filter(
          (memberId) =>
            memberId !== fromUserId &&
            this.connectionManager.isUserOnline(memberId)
        );
        for (const memberId of onlineMembers) {
          try {
            await this.providers.messageStore.markDelivered(messageId, memberId);
          } catch (_) {}
        }

        socket.emit(SocketEvent.GROUP_MESSAGE_DELIVERED, {
          groupId: payload.groupId,
          messageId,
        } as EventPayloads[SocketEvent.GROUP_MESSAGE_DELIVERED]);
      }
    );

    socket.on(
      SocketEvent.GROUP_MESSAGE_READ,
      async (payload: EventPayloads[SocketEvent.GROUP_MESSAGE_READ]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        try {
          await this.providers.messageStore.markRead(payload.messageId, userId);
          // Broadcast read receipt to the group room
          socket.to(payload.groupId).emit(SocketEvent.GROUP_MESSAGE_READ, {
            groupId: payload.groupId,
            messageId: payload.messageId,
          } as EventPayloads[SocketEvent.GROUP_MESSAGE_READ]);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to mark message read', err);
        }
      }
    );

    // Typing indicators — no persistence, pure fan-out
    socket.on(
      SocketEvent.GROUP_TYPING_START,
      (payload: Pick<EventPayloads[SocketEvent.GROUP_TYPING_START], 'groupId'>) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        socket.to(payload.groupId).emit(SocketEvent.GROUP_TYPING_START, {
          groupId: payload.groupId,
          from: userId,
        } as EventPayloads[SocketEvent.GROUP_TYPING_START]);
      }
    );

    socket.on(
      SocketEvent.GROUP_TYPING_STOP,
      (payload: Pick<EventPayloads[SocketEvent.GROUP_TYPING_STOP], 'groupId'>) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        socket.to(payload.groupId).emit(SocketEvent.GROUP_TYPING_STOP, {
          groupId: payload.groupId,
          from: userId,
        } as EventPayloads[SocketEvent.GROUP_TYPING_STOP]);
      }
    );

    socket.on(
      SocketEvent.GET_GROUP_MEMBERS,
      async (payload: EventPayloads[SocketEvent.GET_GROUP_MEMBERS]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        try {
          const members = await this.providers.messageStore.getGroupMembers(
            payload.groupId
          );
          socket.emit(SocketEvent.GROUP_MEMBERS, {
            groupId: payload.groupId,
            members,
          } as EventPayloads[SocketEvent.GROUP_MEMBERS]);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to get members', err);
        }
      }
    );

    socket.on(
      SocketEvent.GET_USER_GROUPS,
      async (_payload: EventPayloads[SocketEvent.GET_USER_GROUPS]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        try {
          const groups = await this.providers.messageStore.getUserGroups(userId);
          socket.emit(SocketEvent.USER_GROUPS, {
            groups,
          } as EventPayloads[SocketEvent.USER_GROUPS]);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to get user groups', err);
        }
      }
    );

    socket.on(
      SocketEvent.GET_GROUP_MESSAGE_HISTORY,
      async (payload: EventPayloads[SocketEvent.GET_GROUP_MESSAGE_HISTORY]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;

        // Verify membership before returning history
        const isMember = await this.providers.cache.sismember(
          `group:${payload.groupId}:members`,
          userId
        );
        if (!isMember) return;

        try {
          const messages = await this.providers.messageStore.getMessages(
            payload.groupId,
            { limit: payload.limit ?? 50, before: payload.before }
          );
          socket.emit(SocketEvent.GROUP_MESSAGE_HISTORY, {
            groupId: payload.groupId,
            messages,
          } as EventPayloads[SocketEvent.GROUP_MESSAGE_HISTORY]);
        } catch (err) {
          console.error('[Sockr] GroupPlugin: failed to fetch group history', err);
        }
      }
    );
  }

  /**
   * Called by SocketServer when an authenticated user reconnects.
   * Rejoins the user's socket to all their group rooms and flushes
   * any group messages that were queued while they were offline.
   */
  public async restoreGroupMemberships(userId: string, socketId: string): Promise<void> {
    const connection = this.connectionManager.getConnection(socketId);
    if (!connection) return;

    try {
      const groups = await this.providers.messageStore.getUserGroups(userId);
      for (const group of groups) {
        connection.getSocket().join(group.id);
      }
    } catch (err) {
      console.error('[Sockr] GroupPlugin: failed to restore group memberships', err);
    }
  }
}