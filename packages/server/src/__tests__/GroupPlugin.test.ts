import { GroupPlugin } from '../plugins/GroupPlugin';
import { SocketEvent } from 'sockr-shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RoomEmitter = { emit: jest.Mock };

type MockSocket = {
  id: string;
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  /** socket.to(room) — returns a room emitter */
  to: jest.Mock<RoomEmitter, [string]>;
  on: jest.Mock;
  handlers: Record<string, Function>;
};

function makeMockSocket(socketId: string): MockSocket {
  const emit = jest.fn();
  const join = jest.fn();
  const leave = jest.fn();
  const roomEmitter: RoomEmitter = { emit: jest.fn() };
  const to = jest.fn<RoomEmitter, [string]>().mockReturnValue(roomEmitter);
  const handlers: Record<string, Function> = {};
  return {
    id: socketId,
    emit,
    join,
    leave,
    to,
    on: jest.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    handlers,
  };
}

function makeMockConn(userId: string | null, socket: MockSocket) {
  return {
    isAuth: jest.fn().mockReturnValue(userId !== null),
    getUserId: jest.fn().mockReturnValue(userId),
    getSocket: jest.fn().mockReturnValue(socket),
  };
}

function makeProviders() {
  const messageStore = {
    saveMessage: jest.fn().mockResolvedValue(undefined),
    getMessage: jest.fn().mockResolvedValue(null),
    getMessages: jest.fn().mockResolvedValue([]),
    getUndeliveredMessages: jest.fn().mockResolvedValue([]),
    markDelivered: jest.fn().mockResolvedValue(undefined),
    markRead: jest.fn().mockResolvedValue(undefined),
    saveGroup: jest.fn().mockResolvedValue(undefined),
    getGroup: jest.fn().mockResolvedValue(null),
    updateGroup: jest.fn().mockResolvedValue(undefined),
    deleteGroup: jest.fn().mockResolvedValue(undefined),
    addGroupMember: jest.fn().mockResolvedValue(undefined),
    removeGroupMember: jest.fn().mockResolvedValue(undefined),
    getGroupMembers: jest.fn().mockResolvedValue([]),
    getUserGroups: jest.fn().mockResolvedValue([]),
  };

  const queue = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    dequeue: jest.fn().mockResolvedValue([]),
    acknowledge: jest.fn().mockResolvedValue(undefined),
    queueLength: jest.fn().mockResolvedValue(0),
  };

  const cache = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    sadd: jest.fn().mockResolvedValue(undefined),
    srem: jest.fn().mockResolvedValue(undefined),
    smembers: jest.fn().mockResolvedValue([]),
    sismember: jest.fn().mockResolvedValue(false),
  };

  return { messageStore, queue, cache };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GroupPlugin', () => {
  let mockIo: { to: jest.Mock<RoomEmitter, [string]> };
  let mockConnectionManager: { getConnection: jest.Mock; getConnectionsByUserId: jest.Mock; isUserOnline: jest.Mock };
  let providers: ReturnType<typeof makeProviders>;
  let plugin: GroupPlugin;

  beforeEach(() => {
    const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
    mockIo = { to: jest.fn<RoomEmitter, [string]>().mockReturnValue(ioRoomEmitter) };
    mockConnectionManager = {
      getConnection: jest.fn().mockReturnValue(null),
      getConnectionsByUserId: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    };
    providers = makeProviders();
    plugin = new GroupPlugin(mockIo as any, mockConnectionManager as any, providers as any);
  });

  function register(socket: MockSocket): Record<string, Function> {
    plugin.handleConnection(socket as any);
    return socket.handlers;
  }

  function authSocket(socketId: string) {
    const socket = makeMockSocket(socketId);
    const userId = `user-${socketId}`;
    const conn = makeMockConn(userId, socket);
    mockConnectionManager.getConnection.mockReturnValue(conn);
    mockConnectionManager.getConnectionsByUserId.mockImplementation((id: string) =>
      id === userId ? [conn] : []
    );
    register(socket);
    return { socket, conn, userId };
  }

  // ─── GROUP_CREATE ─────────────────────────────────────────────────────────

  describe('GROUP_CREATE', () => {
    it('emits GROUP_CREATE_ERROR when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      const unauthConn = makeMockConn(null, socket);
      mockConnectionManager.getConnection.mockReturnValue(unauthConn);
      register(socket);

      await socket.handlers[SocketEvent.GROUP_CREATE]({ name: 'My Group', members: [] });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_CREATE_ERROR,
        expect.objectContaining({ error: 'Not authenticated' })
      );
    });

    it('creates group, persists members, and emits GROUP_CREATED', async () => {
      const { socket, userId } = authSocket('socket-1');

      await socket.handlers[SocketEvent.GROUP_CREATE]({
        name: 'Test Group',
        members: ['invited-user'],
      });

      expect(providers.messageStore.saveGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Group',
          createdBy: userId,
          members: expect.arrayContaining([userId, 'invited-user']),
        })
      );
      expect(providers.messageStore.addGroupMember).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ userId, role: 'admin' })
      );
      expect(providers.messageStore.addGroupMember).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ userId: 'invited-user', role: 'member' })
      );
      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_CREATED,
        expect.objectContaining({ group: expect.objectContaining({ name: 'Test Group' }) })
      );
    });

    it('caches group membership on creation', async () => {
      const { socket, userId } = authSocket('socket-1');

      await socket.handlers[SocketEvent.GROUP_CREATE]({
        name: 'Cached Group',
        members: ['member-2'],
      });

      // cache.sadd spreads members as individual arguments
      expect(providers.cache.sadd).toHaveBeenCalledWith(
        expect.stringContaining('members'),
        userId,
        'member-2'
      );
    });

    it('joins creator socket to the Socket.IO room', async () => {
      const { socket } = authSocket('socket-1');

      await socket.handlers[SocketEvent.GROUP_CREATE]({ name: 'Room Group', members: [] });

      expect(socket.join).toHaveBeenCalledWith(expect.any(String));
    });

    it('joins online invited members to the Socket.IO room', async () => {
      const { socket } = authSocket('socket-1');
      const memberSocket = makeMockSocket('socket-member');
      const memberConn = makeMockConn('invited-user', memberSocket);

      mockConnectionManager.getConnectionsByUserId.mockImplementation((id: string) => {
        if (id === 'invited-user') return [memberConn];
        return [];
      });

      await socket.handlers[SocketEvent.GROUP_CREATE]({ name: 'Group', members: ['invited-user'] });

      expect(memberSocket.join).toHaveBeenCalledWith(expect.any(String));
    });

    it('emits GROUP_CREATE_ERROR when save fails', async () => {
      const { socket } = authSocket('socket-1');
      providers.messageStore.saveGroup.mockRejectedValue(new Error('DB error'));

      await socket.handlers[SocketEvent.GROUP_CREATE]({ name: 'Fail Group', members: [] });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_CREATE_ERROR,
        expect.objectContaining({ error: 'Failed to create group' })
      );
    });
  });

  // ─── GROUP_JOIN ───────────────────────────────────────────────────────────

  describe('GROUP_JOIN', () => {
    const GROUP_ID = 'group-abc';

    it('emits GROUP_JOIN_ERROR when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      const unauthConn = makeMockConn(null, socket);
      mockConnectionManager.getConnection.mockReturnValue(unauthConn);
      register(socket);

      await socket.handlers[SocketEvent.GROUP_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_JOIN_ERROR,
        expect.objectContaining({ error: 'Not authenticated' })
      );
    });

    it('emits GROUP_JOIN_ERROR when group does not exist', async () => {
      const { socket } = authSocket('socket-1');
      providers.messageStore.getGroup.mockResolvedValue(null);

      await socket.handlers[SocketEvent.GROUP_JOIN]({ groupId: 'nonexistent' });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_JOIN_ERROR,
        expect.objectContaining({ error: 'Group not found' })
      );
    });

    it('adds new member to store and cache, notifies room, emits GROUP_JOINED', async () => {
      const { socket, userId } = authSocket('socket-1');
      const existingGroup = { id: GROUP_ID, name: 'G', createdBy: 'other', members: [], createdAt: 0 };
      providers.messageStore.getGroup.mockResolvedValue(existingGroup);
      providers.cache.sismember.mockResolvedValue(false); // not a member yet

      await socket.handlers[SocketEvent.GROUP_JOIN]({ groupId: GROUP_ID });

      expect(providers.messageStore.addGroupMember).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({ userId, role: 'member' })
      );
      expect(providers.cache.sadd).toHaveBeenCalledWith(
        `group:${GROUP_ID}:members`,
        userId
      );
      // GROUP_MEMBER_JOINED broadcast to existing room members
      expect(socket.to).toHaveBeenCalledWith(GROUP_ID);
      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_JOINED,
        expect.objectContaining({ groupId: GROUP_ID })
      );
    });

    it('does not re-add to store/cache if already a member', async () => {
      const { socket } = authSocket('socket-1');
      const existingGroup = { id: GROUP_ID, name: 'G', createdBy: 'other', members: [], createdAt: 0 };
      providers.messageStore.getGroup.mockResolvedValue(existingGroup);
      providers.cache.sismember.mockResolvedValue(true); // already a member

      await socket.handlers[SocketEvent.GROUP_JOIN]({ groupId: GROUP_ID });

      expect(providers.messageStore.addGroupMember).not.toHaveBeenCalled();
      expect(providers.cache.sadd).not.toHaveBeenCalled();
      // Still emits GROUP_JOINED
      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_JOINED,
        expect.objectContaining({ groupId: GROUP_ID })
      );
    });

    it('joins all user sockets to the room (multi-device)', async () => {
      const socket1 = makeMockSocket('socket-1a');
      const socket2 = makeMockSocket('socket-1b');
      const conn1 = makeMockConn('user-multi', socket1);
      const conn2 = makeMockConn('user-multi', socket2);

      mockConnectionManager.getConnection.mockReturnValue(conn1);
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([conn1, conn2]);

      const existingGroup = { id: GROUP_ID, name: 'G', createdBy: 'other', members: [], createdAt: 0 };
      providers.messageStore.getGroup.mockResolvedValue(existingGroup);
      providers.cache.sismember.mockResolvedValue(true);

      register(socket1);
      await socket1.handlers[SocketEvent.GROUP_JOIN]({ groupId: GROUP_ID });

      expect(socket1.join).toHaveBeenCalledWith(GROUP_ID);
      expect(socket2.join).toHaveBeenCalledWith(GROUP_ID);
    });

    it('emits GROUP_JOIN_ERROR when join fails', async () => {
      const { socket } = authSocket('socket-1');
      providers.messageStore.getGroup.mockRejectedValue(new Error('DB error'));

      await socket.handlers[SocketEvent.GROUP_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_JOIN_ERROR,
        expect.objectContaining({ error: 'Failed to join group' })
      );
    });
  });

  // ─── GROUP_LEAVE ──────────────────────────────────────────────────────────

  describe('GROUP_LEAVE', () => {
    const GROUP_ID = 'group-leave';

    it('does nothing when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      await socket.handlers[SocketEvent.GROUP_LEAVE]({ groupId: GROUP_ID });

      expect(providers.messageStore.removeGroupMember).not.toHaveBeenCalled();
    });

    it('removes from store and cache, leaves socket room, emits GROUP_LEFT', async () => {
      const { socket, userId } = authSocket('socket-1');

      await socket.handlers[SocketEvent.GROUP_LEAVE]({ groupId: GROUP_ID });

      expect(providers.messageStore.removeGroupMember).toHaveBeenCalledWith(GROUP_ID, userId);
      expect(providers.cache.srem).toHaveBeenCalledWith(`group:${GROUP_ID}:members`, userId);
      expect(socket.leave).toHaveBeenCalledWith(GROUP_ID);
      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.GROUP_LEFT, { groupId: GROUP_ID });
    });

    it('broadcasts GROUP_MEMBER_LEFT to remaining room members via io.to()', async () => {
      const { userId } = authSocket('socket-1');

      // Capture the io.to().emit call
      const ioRoomEmit = mockIo.to.mock.results[0]?.value?.emit ?? jest.fn();
      mockIo.to.mockReturnValue({ emit: ioRoomEmit });

      const socket2 = makeMockSocket('socket-1');
      const conn2 = makeMockConn(userId, socket2);
      mockConnectionManager.getConnection.mockReturnValue(conn2);
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([conn2]);
      register(socket2);

      await socket2.handlers[SocketEvent.GROUP_LEAVE]({ groupId: GROUP_ID });

      expect(mockIo.to).toHaveBeenCalledWith(GROUP_ID);
      expect(ioRoomEmit).toHaveBeenCalledWith(
        SocketEvent.GROUP_MEMBER_LEFT,
        expect.objectContaining({ groupId: GROUP_ID, userId })
      );
    });

    it('leaves all user sockets from the room (multi-device)', async () => {
      const socket1 = makeMockSocket('socket-1a');
      const socket2 = makeMockSocket('socket-1b');
      const conn1 = makeMockConn('user-multi', socket1);
      const conn2 = makeMockConn('user-multi', socket2);

      mockConnectionManager.getConnection.mockReturnValue(conn1);
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([conn1, conn2]);
      register(socket1);

      await socket1.handlers[SocketEvent.GROUP_LEAVE]({ groupId: GROUP_ID });

      expect(socket1.leave).toHaveBeenCalledWith(GROUP_ID);
      expect(socket2.leave).toHaveBeenCalledWith(GROUP_ID);
    });
  });

  // ─── GROUP_SEND_MESSAGE ───────────────────────────────────────────────────

  describe('GROUP_SEND_MESSAGE', () => {
    const GROUP_ID = 'group-msg';

    it('emits GROUP_MESSAGE_ERROR when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      const unauthConn = makeMockConn(null, socket);
      mockConnectionManager.getConnection.mockReturnValue(unauthConn);
      register(socket);

      await socket.handlers[SocketEvent.GROUP_SEND_MESSAGE]({
        groupId: GROUP_ID,
        content: 'hi',
      });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_MESSAGE_ERROR,
        expect.objectContaining({ error: 'Not authenticated' })
      );
    });

    it('emits GROUP_MESSAGE_ERROR when sender is not a group member', async () => {
      const { socket } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(false);

      await socket.handlers[SocketEvent.GROUP_SEND_MESSAGE]({
        groupId: GROUP_ID,
        content: 'hi',
      });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_MESSAGE_ERROR,
        expect.objectContaining({ error: 'Not a member of this group' })
      );
    });

    it('persists message, broadcasts to room, emits GROUP_MESSAGE_DELIVERED', async () => {
      const { socket, userId } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(true);
      providers.cache.smembers.mockResolvedValue([userId]); // only the sender online

      await socket.handlers[SocketEvent.GROUP_SEND_MESSAGE]({
        groupId: GROUP_ID,
        content: 'Hello group!',
      });

      expect(providers.messageStore.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: GROUP_ID,
          groupId: GROUP_ID,
          from: userId,
          content: 'Hello group!',
        })
      );
      // Broadcast to room via io.to()
      expect(mockIo.to).toHaveBeenCalledWith(GROUP_ID);
      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_MESSAGE_DELIVERED,
        expect.objectContaining({ groupId: GROUP_ID, messageId: expect.any(String) })
      );
    });

    it('queues messages for offline members', async () => {
      const { socket, userId } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(true);
      providers.cache.smembers.mockResolvedValue([userId, 'offline-user']);
      mockConnectionManager.isUserOnline.mockImplementation((id: string) => id === userId);

      await socket.handlers[SocketEvent.GROUP_SEND_MESSAGE]({
        groupId: GROUP_ID,
        content: 'Hi offline!',
      });

      expect(providers.queue.enqueue).toHaveBeenCalledWith(
        'offline-user',
        expect.objectContaining({ content: 'Hi offline!' })
      );
    });

    it('marks delivered for online members (excluding sender)', async () => {
      const { socket, userId } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(true);
      providers.cache.smembers.mockResolvedValue([userId, 'online-other']);
      mockConnectionManager.isUserOnline.mockReturnValue(true);

      await socket.handlers[SocketEvent.GROUP_SEND_MESSAGE]({
        groupId: GROUP_ID,
        content: 'Hi!',
      });

      expect(providers.messageStore.markDelivered).toHaveBeenCalledWith(
        expect.any(String),
        'online-other'
      );
      // Sender is excluded from markDelivered
      expect(providers.messageStore.markDelivered).not.toHaveBeenCalledWith(
        expect.any(String),
        userId
      );
    });

    it('emits GROUP_MESSAGE_ERROR when message save fails', async () => {
      const { socket } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(true);
      providers.messageStore.saveMessage.mockRejectedValue(new Error('DB error'));

      await socket.handlers[SocketEvent.GROUP_SEND_MESSAGE]({
        groupId: GROUP_ID,
        content: 'Fail!',
      });

      expect(socket.emit).toHaveBeenCalledWith(
        SocketEvent.GROUP_MESSAGE_ERROR,
        expect.objectContaining({ error: 'Failed to save message' })
      );
    });
  });

  // ─── GROUP_MESSAGE_READ ───────────────────────────────────────────────────

  describe('GROUP_MESSAGE_READ', () => {
    it('does nothing when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      await socket.handlers[SocketEvent.GROUP_MESSAGE_READ]({
        groupId: 'g1',
        messageId: 'msg-1',
      });

      expect(providers.messageStore.markRead).not.toHaveBeenCalled();
    });

    it('marks read and broadcasts read receipt to the group room', async () => {
      const { socket } = authSocket('socket-1');
      const GROUP_ID = 'group-read';

      await socket.handlers[SocketEvent.GROUP_MESSAGE_READ]({
        groupId: GROUP_ID,
        messageId: 'msg-1',
      });

      expect(providers.messageStore.markRead).toHaveBeenCalledWith('msg-1', 'user-socket-1');
      expect(socket.to).toHaveBeenCalledWith(GROUP_ID);
      const roomEmit = socket.to.mock.results[0].value.emit as jest.Mock;
      expect(roomEmit).toHaveBeenCalledWith(
        SocketEvent.GROUP_MESSAGE_READ,
        expect.objectContaining({ groupId: GROUP_ID, messageId: 'msg-1' })
      );
    });
  });

  // ─── GROUP_TYPING_START / STOP ────────────────────────────────────────────

  describe('GROUP_TYPING_START', () => {
    it('does nothing when not authenticated', () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      socket.handlers[SocketEvent.GROUP_TYPING_START]({ groupId: 'g1' });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('broadcasts typing start to the group room', () => {
      const { socket, userId } = authSocket('socket-1');
      const GROUP_ID = 'group-typing';

      socket.handlers[SocketEvent.GROUP_TYPING_START]({ groupId: GROUP_ID });

      expect(socket.to).toHaveBeenCalledWith(GROUP_ID);
      const roomEmit = socket.to.mock.results[0].value.emit as jest.Mock;
      expect(roomEmit).toHaveBeenCalledWith(
        SocketEvent.GROUP_TYPING_START,
        { groupId: GROUP_ID, from: userId }
      );
    });
  });

  describe('GROUP_TYPING_STOP', () => {
    it('does nothing when not authenticated', () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      socket.handlers[SocketEvent.GROUP_TYPING_STOP]({ groupId: 'g1' });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('broadcasts typing stop to the group room', () => {
      const { socket, userId } = authSocket('socket-1');
      const GROUP_ID = 'group-typing';

      socket.handlers[SocketEvent.GROUP_TYPING_STOP]({ groupId: GROUP_ID });

      expect(socket.to).toHaveBeenCalledWith(GROUP_ID);
      const roomEmit = socket.to.mock.results[0].value.emit as jest.Mock;
      expect(roomEmit).toHaveBeenCalledWith(
        SocketEvent.GROUP_TYPING_STOP,
        { groupId: GROUP_ID, from: userId }
      );
    });
  });

  // ─── GET_GROUP_MEMBERS ────────────────────────────────────────────────────

  describe('GET_GROUP_MEMBERS', () => {
    it('does nothing when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      await socket.handlers[SocketEvent.GET_GROUP_MEMBERS]({ groupId: 'g1' });

      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('fetches members and emits GROUP_MEMBERS', async () => {
      const { socket } = authSocket('socket-1');
      const GROUP_ID = 'group-members';
      const members = [
        { userId: 'alice', role: 'admin', joinedAt: 0 },
        { userId: 'bob', role: 'member', joinedAt: 0 },
      ];
      providers.messageStore.getGroupMembers.mockResolvedValue(members);

      await socket.handlers[SocketEvent.GET_GROUP_MEMBERS]({ groupId: GROUP_ID });

      expect(providers.messageStore.getGroupMembers).toHaveBeenCalledWith(GROUP_ID);
      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.GROUP_MEMBERS, {
        groupId: GROUP_ID,
        members,
      });
    });
  });

  // ─── GET_USER_GROUPS ──────────────────────────────────────────────────────

  describe('GET_USER_GROUPS', () => {
    it('does nothing when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      await socket.handlers[SocketEvent.GET_USER_GROUPS]({});

      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('fetches and emits all groups the user belongs to', async () => {
      const { socket, userId } = authSocket('socket-1');
      const groups = [
        { id: 'g1', name: 'Group 1', createdBy: userId, members: [userId], createdAt: 0 },
        { id: 'g2', name: 'Group 2', createdBy: 'other', members: [userId], createdAt: 0 },
      ];
      providers.messageStore.getUserGroups.mockResolvedValue(groups);

      await socket.handlers[SocketEvent.GET_USER_GROUPS]({});

      expect(providers.messageStore.getUserGroups).toHaveBeenCalledWith(userId);
      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.USER_GROUPS, { groups });
    });
  });

  // ─── GET_GROUP_MESSAGE_HISTORY ────────────────────────────────────────────

  describe('GET_GROUP_MESSAGE_HISTORY', () => {
    const GROUP_ID = 'group-history';

    it('does nothing when not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      await socket.handlers[SocketEvent.GET_GROUP_MESSAGE_HISTORY]({ groupId: GROUP_ID });

      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('does nothing when user is not a member', async () => {
      const { socket } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(false);

      await socket.handlers[SocketEvent.GET_GROUP_MESSAGE_HISTORY]({ groupId: GROUP_ID });

      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('fetches and emits message history for members', async () => {
      const { socket } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(true);
      const messages = [
        { id: 'msg-1', conversationId: GROUP_ID, from: 'user-a', content: 'hi', timestamp: 1, deliveredTo: [], readBy: [] },
      ];
      providers.messageStore.getMessages.mockResolvedValue(messages);

      await socket.handlers[SocketEvent.GET_GROUP_MESSAGE_HISTORY]({
        groupId: GROUP_ID,
        limit: 10,
      });

      expect(providers.messageStore.getMessages).toHaveBeenCalledWith(GROUP_ID, { limit: 10, before: undefined });
      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.GROUP_MESSAGE_HISTORY, {
        groupId: GROUP_ID,
        messages,
      });
    });

    it('uses default limit of 50 when not specified', async () => {
      const { socket } = authSocket('socket-1');
      providers.cache.sismember.mockResolvedValue(true);

      await socket.handlers[SocketEvent.GET_GROUP_MESSAGE_HISTORY]({ groupId: GROUP_ID });

      expect(providers.messageStore.getMessages).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  // ─── restoreGroupMemberships ──────────────────────────────────────────────

  describe('restoreGroupMemberships', () => {
    it('is a no-op when the connection is not found', async () => {
      mockConnectionManager.getConnection.mockReturnValue(null);

      await plugin.restoreGroupMemberships('user-1', 'nonexistent-socket');

      expect(providers.messageStore.getUserGroups).not.toHaveBeenCalled();
    });

    it('joins the user socket to all their group rooms on reconnect', async () => {
      const socket = makeMockSocket('socket-reconnect');
      const conn = makeMockConn('user-reconnect', socket);
      mockConnectionManager.getConnection.mockReturnValue(conn);

      const groups = [
        { id: 'group-1', name: 'G1', createdBy: 'user-reconnect', members: [], createdAt: 0 },
        { id: 'group-2', name: 'G2', createdBy: 'other', members: [], createdAt: 0 },
      ];
      providers.messageStore.getUserGroups.mockResolvedValue(groups);

      await plugin.restoreGroupMemberships('user-reconnect', 'socket-reconnect');

      expect(socket.join).toHaveBeenCalledWith('group-1');
      expect(socket.join).toHaveBeenCalledWith('group-2');
    });

    it('does not throw when getUserGroups fails', async () => {
      const socket = makeMockSocket('socket-1');
      const conn = makeMockConn('user-1', socket);
      mockConnectionManager.getConnection.mockReturnValue(conn);
      providers.messageStore.getUserGroups.mockRejectedValue(new Error('DB error'));

      await expect(
        plugin.restoreGroupMemberships('user-1', 'socket-1')
      ).resolves.not.toThrow();
    });
  });
});
