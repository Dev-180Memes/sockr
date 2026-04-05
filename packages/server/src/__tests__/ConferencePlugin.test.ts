import { ConferencePlugin } from '../plugins/ConferencePlugin';
import { SocketEvent } from 'sockr-shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RoomEmitter = { emit: jest.Mock };

type MockSocket = {
  id: string;
  emit: jest.Mock;
  on: jest.Mock;
  handlers: Record<string, Function>;
};

function makeMockSocket(socketId: string): MockSocket {
  const emit = jest.fn();
  const handlers: Record<string, Function> = {};
  return {
    id: socketId,
    emit,
    on: jest.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    handlers,
  };
}

function makeMockConn(userId: string | null) {
  return {
    isAuth: jest.fn().mockReturnValue(userId !== null),
    getUserId: jest.fn().mockReturnValue(userId),
  };
}

function makeSFUProvider(overrides: Partial<{
  generateToken: jest.Mock;
  createRoom: jest.Mock;
  deleteRoom: jest.Mock;
}> = {}) {
  return {
    generateToken: jest.fn().mockResolvedValue('sfu-token'),
    createRoom: jest.fn().mockResolvedValue(undefined),
    deleteRoom: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeProviders(cacheOverrides: Partial<{ sismember: jest.Mock }> = {}) {
  return {
    cache: {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      sadd: jest.fn().mockResolvedValue(undefined),
      srem: jest.fn().mockResolvedValue(undefined),
      smembers: jest.fn().mockResolvedValue([]),
      sismember: jest.fn().mockResolvedValue(false),
      ...cacheOverrides,
    },
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConferencePlugin', () => {
  const SFU_URL = 'wss://sfu.example.com';

  let mockIo: { to: jest.Mock<RoomEmitter, [string]> };
  let mockConnectionManager: {
    getConnection: jest.Mock;
    getConnectionsByUserId: jest.Mock;
  };
  let sfuProvider: ReturnType<typeof makeSFUProvider>;
  let providers: ReturnType<typeof makeProviders>;
  let plugin: ConferencePlugin;

  beforeEach(() => {
    const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
    mockIo = { to: jest.fn<RoomEmitter, [string]>().mockReturnValue(ioRoomEmitter) };
    mockConnectionManager = {
      getConnection: jest.fn().mockReturnValue(null),
      getConnectionsByUserId: jest.fn().mockReturnValue([]),
    };
    sfuProvider = makeSFUProvider();
    providers = makeProviders();
    plugin = new ConferencePlugin(
      mockIo as any,
      mockConnectionManager as any,
      sfuProvider as any,
      SFU_URL,
      providers
    );
  });

  function register(socket: MockSocket): Record<string, Function> {
    plugin.handleConnection(socket as any);
    return socket.handlers;
  }

  function authSocket(socketId: string, userId: string) {
    const socket = makeMockSocket(socketId);
    const conn = makeMockConn(userId);
    mockConnectionManager.getConnection.mockImplementation((id: string) =>
      id === socketId ? conn : null
    );
    mockConnectionManager.getConnectionsByUserId.mockImplementation((id: string) =>
      id === userId ? [conn] : []
    );
    register(socket);
    return { socket, conn, userId };
  }

  // ─── CONFERENCE_JOIN ───────────────────────────────────────────────────────

  describe('CONFERENCE_JOIN', () => {
    const GROUP_ID = 'group-conf';

    it('emits CONFERENCE_ERROR when socket has no connection', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ERROR, {
        groupId: GROUP_ID,
        error: 'Not authenticated',
      });
    });

    it('emits CONFERENCE_ERROR when connection is not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn(null));
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ERROR, {
        groupId: GROUP_ID,
        error: 'Not authenticated',
      });
    });

    it('emits CONFERENCE_ERROR when user is not a group member', async () => {
      const { socket } = authSocket('socket-1', 'user-1');
      providers.cache.sismember.mockResolvedValue(false);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ERROR, {
        groupId: GROUP_ID,
        error: 'Not a member of this group',
      });
    });

    it('emits CONFERENCE_ERROR when cache membership check throws', async () => {
      const { socket } = authSocket('socket-1', 'user-1');
      providers.cache.sismember.mockRejectedValue(new Error('Redis error'));

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ERROR, {
        groupId: GROUP_ID,
        error: 'Failed to verify group membership',
      });
    });

    it('creates SFU room on first participant join', async () => {
      const { socket } = authSocket('socket-1', 'user-1');
      providers.cache.sismember.mockResolvedValue(true);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(sfuProvider.createRoom).toHaveBeenCalledWith(GROUP_ID);
    });

    it('emits CONFERENCE_TOKEN to the joining socket with sfuUrl and token', async () => {
      const { socket } = authSocket('socket-1', 'user-1');
      providers.cache.sismember.mockResolvedValue(true);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_TOKEN, {
        groupId: GROUP_ID,
        sfuUrl: SFU_URL,
        token: 'sfu-token',
      });
    });

    it('emits CONFERENCE_STARTED to the group room when first participant joins', async () => {
      const { userId } = authSocket('socket-1', 'user-1');
      providers.cache.sismember.mockResolvedValue(true);
      const socket = makeMockSocket('socket-1');
      const conn = makeMockConn(userId);
      mockConnectionManager.getConnection.mockReturnValue(conn);
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(mockIo.to).toHaveBeenCalledWith(GROUP_ID);
      const roomEmit = mockIo.to.mock.results[0].value.emit as jest.Mock;
      expect(roomEmit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_STARTED, {
        groupId: GROUP_ID,
        startedBy: userId,
        participantCount: 1,
      });
    });

    it('does not create SFU room for the second participant', async () => {
      providers.cache.sismember.mockResolvedValue(true);

      // First participant
      authSocket('socket-1', 'user-1');
      const socket1 = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      register(socket1);
      await socket1.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      const createRoomCallCount = sfuProvider.createRoom.mock.calls.length;

      // Second participant
      const socket2 = makeMockSocket('socket-2');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-2'));
      register(socket2);
      await socket2.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(sfuProvider.createRoom).toHaveBeenCalledTimes(createRoomCallCount);
    });

    it('emits CONFERENCE_PARTICIPANT_JOINED to room when a second user joins', async () => {
      providers.cache.sismember.mockResolvedValue(true);

      // First participant
      const socket1 = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      register(socket1);
      await socket1.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      // Reset mock call history
      mockIo.to.mockClear();
      const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
      mockIo.to.mockReturnValue(ioRoomEmitter);

      // Second participant
      const socket2 = makeMockSocket('socket-2');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-2'));
      register(socket2);
      await socket2.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(mockIo.to).toHaveBeenCalledWith(GROUP_ID);
      expect(ioRoomEmitter.emit).toHaveBeenCalledWith(
        SocketEvent.CONFERENCE_PARTICIPANT_JOINED,
        expect.objectContaining({ groupId: GROUP_ID, userId: 'user-2', participantCount: 2 })
      );
    });

    it('does not emit CONFERENCE_PARTICIPANT_JOINED if the same user rejoins', async () => {
      providers.cache.sismember.mockResolvedValue(true);
      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      register(socket);

      // First join
      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      mockIo.to.mockClear();
      const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
      mockIo.to.mockReturnValue(ioRoomEmitter);

      // Same user joins again
      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      const participantJoinedCalls = ioRoomEmitter.emit.mock.calls.filter(
        (c) => c[0] === SocketEvent.CONFERENCE_PARTICIPANT_JOINED
      );
      expect(participantJoinedCalls).toHaveLength(0);
    });

    it('emits CONFERENCE_ERROR when SFU room creation fails', async () => {
      providers.cache.sismember.mockResolvedValue(true);
      sfuProvider.createRoom.mockRejectedValue(new Error('SFU unavailable'));

      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ERROR, {
        groupId: GROUP_ID,
        error: 'Failed to create conference room',
      });
    });

    it('emits CONFERENCE_ERROR when token generation fails', async () => {
      providers.cache.sismember.mockResolvedValue(true);
      sfuProvider.generateToken.mockRejectedValue(new Error('Token service down'));

      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ERROR, {
        groupId: GROUP_ID,
        error: 'Failed to generate access token',
      });
    });

    it('generates a unique token per user (calls generateToken with groupId and userId)', async () => {
      providers.cache.sismember.mockResolvedValue(true);

      const socket1 = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      register(socket1);
      await socket1.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });

      expect(sfuProvider.generateToken).toHaveBeenCalledWith(GROUP_ID, 'user-1');
    });
  });

  // ─── CONFERENCE_LEAVE ──────────────────────────────────────────────────────

  describe('CONFERENCE_LEAVE', () => {
    const GROUP_ID = 'group-leave';

    async function joinUser(socketId: string, userId: string) {
      providers.cache.sismember.mockResolvedValue(true);
      const socket = makeMockSocket(socketId);
      mockConnectionManager.getConnection.mockImplementation((id: string) =>
        id === socketId ? makeMockConn(userId) : null
      );
      mockConnectionManager.getConnectionsByUserId.mockImplementation((id: string) =>
        id === userId ? [makeMockConn(userId)] : []
      );
      register(socket);
      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });
      return socket;
    }

    it('does nothing when connection is not authenticated', async () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_LEAVE]({ groupId: GROUP_ID });

      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it('does nothing when the user is not in the specified room', async () => {
      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_LEAVE]({ groupId: GROUP_ID });

      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it('emits CONFERENCE_ENDED when last participant leaves and deletes SFU room', async () => {
      await joinUser('socket-1', 'user-1');

      // Now user-1 leaves — they are the only participant
      mockIo.to.mockClear();
      const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
      mockIo.to.mockReturnValue(ioRoomEmitter);

      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      // Last socket — no other connections
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([makeMockConn('user-1')]);
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_LEAVE]({ groupId: GROUP_ID });

      expect(sfuProvider.deleteRoom).toHaveBeenCalledWith(GROUP_ID);
      expect(mockIo.to).toHaveBeenCalledWith(GROUP_ID);
      expect(ioRoomEmitter.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ENDED, { groupId: GROUP_ID });
    });

    it('emits CONFERENCE_PARTICIPANT_LEFT when a non-last participant leaves', async () => {
      await joinUser('socket-1', 'user-1');
      await joinUser('socket-2', 'user-2');

      mockIo.to.mockClear();
      const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
      mockIo.to.mockReturnValue(ioRoomEmitter);

      // user-1 leaves — user-2 remains
      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      mockConnectionManager.getConnectionsByUserId.mockImplementation((id: string) =>
        id === 'user-1' ? [makeMockConn('user-1')] : []
      );
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_LEAVE]({ groupId: GROUP_ID });

      expect(sfuProvider.deleteRoom).not.toHaveBeenCalled();
      expect(mockIo.to).toHaveBeenCalledWith(GROUP_ID);
      expect(ioRoomEmitter.emit).toHaveBeenCalledWith(
        SocketEvent.CONFERENCE_PARTICIPANT_LEFT,
        expect.objectContaining({ groupId: GROUP_ID, userId: 'user-1', participantCount: 1 })
      );
    });

    it('does not remove participant if they still have another active socket (multi-device)', async () => {
      await joinUser('socket-1', 'user-multi');

      mockIo.to.mockClear();

      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-multi'));
      // Two connections still active — leave should be a no-op
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([
        makeMockConn('user-multi'),
        makeMockConn('user-multi'),
      ]);
      register(socket);

      await socket.handlers[SocketEvent.CONFERENCE_LEAVE]({ groupId: GROUP_ID });

      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it('does not throw when SFU deleteRoom fails during last-participant leave', async () => {
      await joinUser('socket-1', 'user-1');
      sfuProvider.deleteRoom.mockRejectedValue(new Error('SFU error'));

      const socket = makeMockSocket('socket-1');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-1'));
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([makeMockConn('user-1')]);
      register(socket);

      // Should resolve without throwing even if deleteRoom rejects
      await expect(
        socket.handlers[SocketEvent.CONFERENCE_LEAVE]({ groupId: GROUP_ID })
      ).resolves.not.toThrow();
    });
  });

  // ─── cleanupParticipant ────────────────────────────────────────────────────

  describe('cleanupParticipant', () => {
    const GROUP_ID = 'group-cleanup';

    async function joinUser(socketId: string, userId: string) {
      providers.cache.sismember.mockResolvedValue(true);
      const socket = makeMockSocket(socketId);
      mockConnectionManager.getConnection.mockImplementation((id: string) =>
        id === socketId ? makeMockConn(userId) : null
      );
      mockConnectionManager.getConnectionsByUserId.mockImplementation((id: string) =>
        id === userId ? [makeMockConn(userId)] : []
      );
      register(socket);
      await socket.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_ID });
    }

    it('is a no-op when the user is not in any conference room', async () => {
      await plugin.cleanupParticipant('user-not-in-room');
      expect(mockIo.to).not.toHaveBeenCalledWith(GROUP_ID);
    });

    it('emits CONFERENCE_ENDED and deletes room when the last participant disconnects', async () => {
      await joinUser('socket-1', 'user-1');

      mockIo.to.mockClear();
      const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
      mockIo.to.mockReturnValue(ioRoomEmitter);

      // Last socket disconnects
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([makeMockConn('user-1')]);

      await plugin.cleanupParticipant('user-1');

      expect(sfuProvider.deleteRoom).toHaveBeenCalledWith(GROUP_ID);
      expect(ioRoomEmitter.emit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_ENDED, { groupId: GROUP_ID });
    });

    it('emits CONFERENCE_PARTICIPANT_LEFT when a non-last participant disconnects', async () => {
      await joinUser('socket-1', 'user-1');
      await joinUser('socket-2', 'user-2');

      mockIo.to.mockClear();
      const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
      mockIo.to.mockReturnValue(ioRoomEmitter);

      // user-1 has only one socket
      mockConnectionManager.getConnectionsByUserId.mockImplementation((id: string) =>
        id === 'user-1' ? [makeMockConn('user-1')] : [makeMockConn('user-2')]
      );

      await plugin.cleanupParticipant('user-1');

      expect(sfuProvider.deleteRoom).not.toHaveBeenCalled();
      expect(ioRoomEmitter.emit).toHaveBeenCalledWith(
        SocketEvent.CONFERENCE_PARTICIPANT_LEFT,
        expect.objectContaining({ groupId: GROUP_ID, userId: 'user-1' })
      );
    });

    it('cleans up across multiple rooms when user was in several groups', async () => {
      const GROUP_A = 'group-a';
      const GROUP_B = 'group-b';

      // Join group A
      providers.cache.sismember.mockResolvedValue(true);
      const socketA = makeMockSocket('socket-a');
      mockConnectionManager.getConnection.mockReturnValue(makeMockConn('user-multi'));
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([makeMockConn('user-multi')]);
      register(socketA);
      await socketA.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_A });

      // Join group B
      const socketB = makeMockSocket('socket-b');
      register(socketB);
      await socketB.handlers[SocketEvent.CONFERENCE_JOIN]({ groupId: GROUP_B });

      mockIo.to.mockClear();
      const ioRoomEmitter: RoomEmitter = { emit: jest.fn() };
      mockIo.to.mockReturnValue(ioRoomEmitter);

      await plugin.cleanupParticipant('user-multi');

      // Should have emitted CONFERENCE_ENDED for both groups
      const endedCalls = ioRoomEmitter.emit.mock.calls.filter(
        (c) => c[0] === SocketEvent.CONFERENCE_ENDED
      );
      expect(endedCalls).toHaveLength(2);
    });

    it('does not remove participant if they still have another active socket (multi-device)', async () => {
      await joinUser('socket-1', 'user-multi');

      mockIo.to.mockClear();

      // Two connections still alive
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([
        makeMockConn('user-multi'),
        makeMockConn('user-multi'),
      ]);

      await plugin.cleanupParticipant('user-multi');

      expect(mockIo.to).not.toHaveBeenCalledWith(GROUP_ID);
    });
  });
});
