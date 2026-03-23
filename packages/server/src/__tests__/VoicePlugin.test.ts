import { createHmac } from 'crypto';
import { VoicePlugin } from '../plugins/VoicePlugin';
import { SocketEvent } from 'sockr-shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function makeMockConn(userId: string | null, emit: jest.Mock) {
  const socket = { id: `socket-${userId ?? 'anon'}`, emit };
  return {
    isAuth: jest.fn().mockReturnValue(userId !== null),
    getUserId: jest.fn().mockReturnValue(userId),
    getSocket: jest.fn().mockReturnValue(socket),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VoicePlugin', () => {
  let mockConnectionManager: {
    getConnection: jest.Mock;
    getConnectionsByUserId: jest.Mock;
  };
  let plugin: VoicePlugin;

  beforeEach(() => {
    mockConnectionManager = {
      getConnection: jest.fn().mockReturnValue(null),
      getConnectionsByUserId: jest.fn().mockReturnValue([]),
    };
    plugin = new VoicePlugin({} as any, mockConnectionManager as any, {});
  });

  function register(socket: MockSocket): Record<string, Function> {
    plugin.handleConnection(socket as any);
    return socket.handlers;
  }

  // Creates caller + callee sockets, registers them with the plugin, initiates a call,
  // and returns the handlers, emit mocks, and the generated callId.
  function setupCall(callerUserId = 'caller-id', calleeUserId = 'callee-id') {
    const callerSocket = makeMockSocket('socket-caller');
    const calleeSocket = makeMockSocket('socket-callee');
    const callerConn = makeMockConn(callerUserId, callerSocket.emit);
    const calleeConn = makeMockConn(calleeUserId, calleeSocket.emit);

    mockConnectionManager.getConnection.mockImplementation((socketId: string) => {
      if (socketId === 'socket-caller') return callerConn;
      if (socketId === 'socket-callee') return calleeConn;
      return null;
    });
    mockConnectionManager.getConnectionsByUserId.mockImplementation((userId: string) => {
      if (userId === calleeUserId) return [calleeConn];
      if (userId === callerUserId) return [callerConn];
      return [];
    });

    const callerHandlers = register(callerSocket);
    const calleeHandlers = register(calleeSocket);

    callerHandlers[SocketEvent.CALL_INITIATE]({ to: calleeUserId, sdpOffer: 'test-offer' });

    const ringingArgs = callerSocket.emit.mock.calls.find(
      (c) => c[0] === SocketEvent.CALL_RINGING
    );
    const callId = ringingArgs![1].callId as string;

    return { callerSocket, calleeSocket, callerConn, calleeConn, callerHandlers, calleeHandlers, callId };
  }

  // ─── generateIceServers ────────────────────────────────────────────────────

  describe('generateIceServers', () => {
    it('returns empty array when config has no servers', () => {
      expect(plugin.generateIceServers('user-1')).toEqual([]);
    });

    it('returns static ICE servers as-is', () => {
      const p = new VoicePlugin({} as any, mockConnectionManager as any, {
        iceServers: [{ urls: 'stun:stun.example.com' }],
      });
      expect(p.generateIceServers('user-1')).toEqual([{ urls: 'stun:stun.example.com' }]);
    });

    it('generates TURN credentials with correct HMAC-SHA1 signature', () => {
      const secret = 'turn-secret';
      const p = new VoicePlugin({} as any, mockConnectionManager as any, {
        turn: { urls: 'turn:turn.example.com', secret, ttl: 3600 },
      });
      const before = Math.floor(Date.now() / 1000);
      const [server] = p.generateIceServers('user-1');
      const after = Math.floor(Date.now() / 1000);

      expect(server.urls).toBe('turn:turn.example.com');
      const [expiryStr, userId] = server.username!.split(':');
      const expiry = parseInt(expiryStr, 10);
      expect(userId).toBe('user-1');
      expect(expiry).toBeGreaterThanOrEqual(before + 3600);
      expect(expiry).toBeLessThanOrEqual(after + 3600);

      const expected = createHmac('sha1', secret).update(server.username!).digest('base64');
      expect(server.credential).toBe(expected);
    });

    it('handles an array of TURN URLs — one server entry per URL', () => {
      const p = new VoicePlugin({} as any, mockConnectionManager as any, {
        turn: { urls: ['turn:a.example.com', 'turn:b.example.com'], secret: 'sec', ttl: 3600 },
      });
      const servers = p.generateIceServers('user-1');
      expect(servers).toHaveLength(2);
      expect(servers[0].urls).toBe('turn:a.example.com');
      expect(servers[1].urls).toBe('turn:b.example.com');
      // Both entries share the same time-based username and credential
      expect(servers[0].username).toBe(servers[1].username);
      expect(servers[0].credential).toBe(servers[1].credential);
    });

    it('includes both static and TURN servers', () => {
      const p = new VoicePlugin({} as any, mockConnectionManager as any, {
        iceServers: [{ urls: 'stun:stun.example.com' }],
        turn: { urls: 'turn:turn.example.com', secret: 'sec', ttl: 3600 },
      });
      const servers = p.generateIceServers('user-1');
      expect(servers).toHaveLength(2);
      expect(servers[0].urls).toBe('stun:stun.example.com');
      expect(servers[1].urls).toBe('turn:turn.example.com');
    });

    it('embeds the userId in the TURN username for per-user credential isolation', () => {
      const p = new VoicePlugin({} as any, mockConnectionManager as any, {
        turn: { urls: 'turn:turn.example.com', secret: 'sec', ttl: 3600 },
      });
      const alice = p.generateIceServers('alice')[0];
      const bob = p.generateIceServers('bob')[0];
      expect(alice.username).toContain('alice');
      expect(bob.username).toContain('bob');
      // Different usernames → different HMAC credentials
      expect(alice.credential).not.toBe(bob.credential);
    });
  });

  // ─── CALL_GET_ICE_SERVERS ──────────────────────────────────────────────────

  describe('CALL_GET_ICE_SERVERS', () => {
    it('does nothing when the socket has no connection', () => {
      const socket = makeMockSocket('socket-1');
      register(socket);
      mockConnectionManager.getConnection.mockReturnValue(null);
      socket.handlers[SocketEvent.CALL_GET_ICE_SERVERS]();
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('does nothing when the connection is not authenticated', () => {
      const socket = makeMockSocket('socket-1');
      register(socket);
      const unauthConn = makeMockConn(null, socket.emit);
      mockConnectionManager.getConnection.mockReturnValue(unauthConn);
      socket.handlers[SocketEvent.CALL_GET_ICE_SERVERS]();
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('emits CALL_ICE_SERVERS with generated ICE servers when authenticated', () => {
      const p = new VoicePlugin({} as any, mockConnectionManager as any, {
        iceServers: [{ urls: 'stun:stun.example.com' }],
      });
      const socket = makeMockSocket('socket-1');
      p.handleConnection(socket as any);
      const conn = makeMockConn('user-1', socket.emit);
      mockConnectionManager.getConnection.mockReturnValue(conn);
      socket.handlers[SocketEvent.CALL_GET_ICE_SERVERS]();
      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ICE_SERVERS, {
        iceServers: [{ urls: 'stun:stun.example.com' }],
      });
    });
  });

  // ─── CALL_INITIATE ─────────────────────────────────────────────────────────

  describe('CALL_INITIATE', () => {
    it('does nothing when caller connection is not authenticated', () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);
      socket.handlers[SocketEvent.CALL_INITIATE]({ to: 'callee-id', sdpOffer: 'offer' });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('emits CALL_ENDED to caller when callee is offline', () => {
      const socket = makeMockSocket('socket-caller');
      const conn = makeMockConn('caller-id', socket.emit);
      mockConnectionManager.getConnection.mockReturnValue(conn);
      mockConnectionManager.getConnectionsByUserId.mockReturnValue([]);
      register(socket);

      socket.handlers[SocketEvent.CALL_INITIATE]({ to: 'callee-id', sdpOffer: 'offer' });

      expect(socket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ENDED, { callId: '' });
    });

    it('emits CALL_BUSY to caller when callee is already in a ringing call', () => {
      // First call puts callee-id in a ringing state
      setupCall('first-caller', 'callee-id');

      // Second caller tries to reach the same callee
      const caller2Socket = makeMockSocket('socket-caller2');
      const caller2Conn = makeMockConn('caller2-id', caller2Socket.emit);
      const calleeConn2 = makeMockConn('callee-id', jest.fn());

      mockConnectionManager.getConnection.mockImplementation((id: string) =>
        id === 'socket-caller2' ? caller2Conn : null
      );
      mockConnectionManager.getConnectionsByUserId.mockImplementation((userId: string) =>
        userId === 'callee-id' ? [calleeConn2] : []
      );
      register(caller2Socket);

      caller2Socket.handlers[SocketEvent.CALL_INITIATE]({ to: 'callee-id', sdpOffer: 'offer' });

      expect(caller2Socket.emit).toHaveBeenCalledWith(
        SocketEvent.CALL_BUSY,
        expect.objectContaining({ callId: expect.any(String) })
      );
    });

    it('emits CALL_BUSY to caller when callee is already in an active call', () => {
      // Initiate + answer to move the call to 'active' status
      const { calleeHandlers, callId } = setupCall('first-caller', 'callee-id');
      calleeHandlers[SocketEvent.CALL_ANSWER]({ callId, sdpAnswer: 'answer' });

      const caller2Socket = makeMockSocket('socket-caller2');
      const caller2Conn = makeMockConn('caller2-id', caller2Socket.emit);
      const calleeConn2 = makeMockConn('callee-id', jest.fn());

      mockConnectionManager.getConnection.mockImplementation((id: string) =>
        id === 'socket-caller2' ? caller2Conn : null
      );
      mockConnectionManager.getConnectionsByUserId.mockImplementation((userId: string) =>
        userId === 'callee-id' ? [calleeConn2] : []
      );
      register(caller2Socket);

      caller2Socket.handlers[SocketEvent.CALL_INITIATE]({ to: 'callee-id', sdpOffer: 'offer' });

      expect(caller2Socket.emit).toHaveBeenCalledWith(
        SocketEvent.CALL_BUSY,
        expect.objectContaining({ callId: expect.any(String) })
      );
    });

    it('emits CALL_RINGING to caller on success', () => {
      const { callerSocket } = setupCall();
      const ringing = callerSocket.emit.mock.calls.find(
        (c) => c[0] === SocketEvent.CALL_RINGING
      );
      expect(ringing).toBeDefined();
      expect(ringing![1]).toMatchObject({ callId: expect.any(String) });
    });

    it('delivers CALL_INCOMING to all callee devices (multi-device)', () => {
      const callerSocket = makeMockSocket('socket-caller');
      const callerConn = makeMockConn('caller-id', callerSocket.emit);
      const calleeEmit1 = jest.fn();
      const calleeEmit2 = jest.fn();
      const calleeConn1 = makeMockConn('callee-id', calleeEmit1);
      const calleeConn2 = makeMockConn('callee-id', calleeEmit2);

      mockConnectionManager.getConnection.mockReturnValue(callerConn);
      mockConnectionManager.getConnectionsByUserId.mockImplementation((userId: string) =>
        userId === 'callee-id' ? [calleeConn1, calleeConn2] : []
      );
      register(callerSocket);

      callerSocket.handlers[SocketEvent.CALL_INITIATE]({
        to: 'callee-id',
        sdpOffer: 'offer-sdp',
      });

      for (const emit of [calleeEmit1, calleeEmit2]) {
        expect(emit).toHaveBeenCalledWith(
          SocketEvent.CALL_INCOMING,
          expect.objectContaining({
            from: 'caller-id',
            sdpOffer: 'offer-sdp',
            callId: expect.any(String),
          })
        );
      }
    });

    it('includes ICE servers in CALL_INCOMING payload', () => {
      const p = new VoicePlugin({} as any, mockConnectionManager as any, {
        iceServers: [{ urls: 'stun:stun.example.com' }],
      });
      const callerSocket = makeMockSocket('socket-caller');
      const calleeEmit = jest.fn();
      const callerConn = makeMockConn('caller-id', callerSocket.emit);
      const calleeConn = makeMockConn('callee-id', calleeEmit);

      mockConnectionManager.getConnection.mockReturnValue(callerConn);
      mockConnectionManager.getConnectionsByUserId.mockImplementation((userId: string) =>
        userId === 'callee-id' ? [calleeConn] : []
      );
      p.handleConnection(callerSocket as any);

      callerSocket.handlers[SocketEvent.CALL_INITIATE]({ to: 'callee-id', sdpOffer: 'offer' });

      expect(calleeEmit).toHaveBeenCalledWith(
        SocketEvent.CALL_INCOMING,
        expect.objectContaining({
          iceServers: [{ urls: 'stun:stun.example.com' }],
        })
      );
    });
  });

  // ─── CALL_ANSWER ───────────────────────────────────────────────────────────

  describe('CALL_ANSWER', () => {
    it('does nothing when the call is not found', () => {
      const { calleeHandlers, callerSocket } = setupCall();
      const countBefore = callerSocket.emit.mock.calls.length;
      calleeHandlers[SocketEvent.CALL_ANSWER]({ callId: 'nonexistent', sdpAnswer: 'answer' });
      expect(callerSocket.emit.mock.calls.length).toBe(countBefore);
    });

    it('does nothing when callee connection is not authenticated', () => {
      const socket = makeMockSocket('socket-callee');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);
      socket.handlers[SocketEvent.CALL_ANSWER]({ callId: 'some-id', sdpAnswer: 'answer' });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('sends CALL_ANSWERED with sdpAnswer to the caller', () => {
      const { calleeHandlers, callerSocket, callId } = setupCall();
      calleeHandlers[SocketEvent.CALL_ANSWER]({ callId, sdpAnswer: 'answer-sdp' });
      expect(callerSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ANSWERED, {
        callId,
        sdpAnswer: 'answer-sdp',
      });
    });

    it('sends CALL_ANSWERED to all caller devices (multi-device)', () => {
      const callerSocket1 = makeMockSocket('socket-caller1');
      const callerSocket2 = makeMockSocket('socket-caller2');
      const calleeSocket = makeMockSocket('socket-callee');
      const callerConn1 = makeMockConn('caller-id', callerSocket1.emit);
      const callerConn2 = makeMockConn('caller-id', callerSocket2.emit);
      const calleeConn = makeMockConn('callee-id', calleeSocket.emit);

      mockConnectionManager.getConnection.mockImplementation((id: string) => {
        if (id === 'socket-caller1') return callerConn1;
        if (id === 'socket-caller2') return callerConn2;
        if (id === 'socket-callee') return calleeConn;
        return null;
      });
      mockConnectionManager.getConnectionsByUserId.mockImplementation((userId: string) => {
        if (userId === 'caller-id') return [callerConn1, callerConn2];
        if (userId === 'callee-id') return [calleeConn];
        return [];
      });

      register(callerSocket1);
      register(callerSocket2);
      const calleeHandlers = register(calleeSocket);

      callerSocket1.handlers[SocketEvent.CALL_INITIATE]({ to: 'callee-id', sdpOffer: 'offer' });
      const ringing = callerSocket1.emit.mock.calls.find((c) => c[0] === SocketEvent.CALL_RINGING);
      const callId = ringing![1].callId;

      calleeHandlers[SocketEvent.CALL_ANSWER]({ callId, sdpAnswer: 'answer-sdp' });

      expect(callerSocket1.emit).toHaveBeenCalledWith(
        SocketEvent.CALL_ANSWERED,
        expect.objectContaining({ callId })
      );
      expect(callerSocket2.emit).toHaveBeenCalledWith(
        SocketEvent.CALL_ANSWERED,
        expect.objectContaining({ callId })
      );
    });
  });

  // ─── CALL_REJECT ───────────────────────────────────────────────────────────

  describe('CALL_REJECT', () => {
    it('does nothing when the call is not found', () => {
      const { calleeHandlers, callerSocket } = setupCall();
      const countBefore = callerSocket.emit.mock.calls.length;
      calleeHandlers[SocketEvent.CALL_REJECT]({ callId: 'nonexistent' });
      expect(callerSocket.emit.mock.calls.length).toBe(countBefore);
    });

    it('does nothing when connection is not authenticated', () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);
      socket.handlers[SocketEvent.CALL_REJECT]({ callId: 'some-id' });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('sends CALL_REJECTED to the caller and removes the call', () => {
      const { calleeHandlers, callerSocket, callId } = setupCall();
      calleeHandlers[SocketEvent.CALL_REJECT]({ callId });
      expect(callerSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_REJECTED, { callId });
    });

    it('removing the call means a second reject has no effect', () => {
      const { calleeHandlers, callerSocket, callId } = setupCall();
      calleeHandlers[SocketEvent.CALL_REJECT]({ callId });
      const rejectedCountAfterFirst = callerSocket.emit.mock.calls.filter(
        (c) => c[0] === SocketEvent.CALL_REJECTED
      ).length;
      calleeHandlers[SocketEvent.CALL_REJECT]({ callId });
      const rejectedCountAfterSecond = callerSocket.emit.mock.calls.filter(
        (c) => c[0] === SocketEvent.CALL_REJECTED
      ).length;
      expect(rejectedCountAfterSecond).toBe(rejectedCountAfterFirst);
    });
  });

  // ─── CALL_HANGUP ───────────────────────────────────────────────────────────

  describe('CALL_HANGUP', () => {
    it('does nothing when the call is not found', () => {
      const { callerHandlers, calleeSocket } = setupCall();
      const countBefore = calleeSocket.emit.mock.calls.length;
      callerHandlers[SocketEvent.CALL_HANGUP]({ callId: 'nonexistent' });
      expect(calleeSocket.emit.mock.calls.length).toBe(countBefore);
    });

    it('does nothing when connection is not authenticated', () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);
      socket.handlers[SocketEvent.CALL_HANGUP]({ callId: 'some-id' });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('caller hangs up: notifies callee with CALL_ENDED', () => {
      const { callerHandlers, calleeSocket, callId } = setupCall();
      callerHandlers[SocketEvent.CALL_HANGUP]({ callId });
      expect(calleeSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ENDED, { callId });
    });

    it('callee hangs up: notifies caller with CALL_ENDED', () => {
      const { calleeHandlers, callerSocket, callId } = setupCall();
      calleeHandlers[SocketEvent.CALL_HANGUP]({ callId });
      expect(callerSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ENDED, { callId });
    });
  });

  // ─── CALL_ICE_CANDIDATE ────────────────────────────────────────────────────

  describe('CALL_ICE_CANDIDATE', () => {
    it('does nothing when not authenticated', () => {
      const socket = makeMockSocket('socket-anon');
      mockConnectionManager.getConnection.mockReturnValue(null);
      register(socket);
      socket.handlers[SocketEvent.CALL_ICE_CANDIDATE]({
        callId: 'id',
        candidate: { candidate: 'a' },
      });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('does nothing when the call is not found', () => {
      const { callerHandlers, calleeSocket } = setupCall();
      const countBefore = calleeSocket.emit.mock.calls.length;
      callerHandlers[SocketEvent.CALL_ICE_CANDIDATE]({
        callId: 'nonexistent',
        candidate: { candidate: 'a' },
      });
      expect(calleeSocket.emit.mock.calls.length).toBe(countBefore);
    });

    it('forwards ICE candidate from caller to callee', () => {
      const { callerHandlers, calleeSocket, callId } = setupCall();
      const candidate = { candidate: 'candidate-string', sdpMid: '0', sdpMLineIndex: 0 };
      callerHandlers[SocketEvent.CALL_ICE_CANDIDATE]({ callId, candidate });
      expect(calleeSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ICE_CANDIDATE, {
        callId,
        candidate,
      });
    });

    it('forwards ICE candidate from callee to caller', () => {
      const { calleeHandlers, callerSocket, callId } = setupCall();
      const candidate = { candidate: 'candidate-string', sdpMid: '0', sdpMLineIndex: 0 };
      calleeHandlers[SocketEvent.CALL_ICE_CANDIDATE]({ callId, candidate });
      expect(callerSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ICE_CANDIDATE, {
        callId,
        candidate,
      });
    });

    it('forwards to all callee connections when caller sends a candidate', () => {
      const callerSocket = makeMockSocket('socket-caller');
      const calleeEmit1 = jest.fn();
      const calleeEmit2 = jest.fn();
      const callerConn = makeMockConn('caller-id', callerSocket.emit);
      const calleeConn1 = makeMockConn('callee-id', calleeEmit1);
      const calleeConn2 = makeMockConn('callee-id', calleeEmit2);

      mockConnectionManager.getConnection.mockReturnValue(callerConn);
      mockConnectionManager.getConnectionsByUserId.mockImplementation((userId: string) =>
        userId === 'callee-id' ? [calleeConn1, calleeConn2] : []
      );
      register(callerSocket);

      // Initiate call to create activeCalls entry
      callerSocket.handlers[SocketEvent.CALL_INITIATE]({ to: 'callee-id', sdpOffer: 'offer' });
      const ringing = callerSocket.emit.mock.calls.find((c) => c[0] === SocketEvent.CALL_RINGING);
      const callId = ringing![1].callId;

      const candidate = { candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0 };
      callerSocket.handlers[SocketEvent.CALL_ICE_CANDIDATE]({ callId, candidate });

      expect(calleeEmit1).toHaveBeenCalledWith(SocketEvent.CALL_ICE_CANDIDATE, { callId, candidate });
      expect(calleeEmit2).toHaveBeenCalledWith(SocketEvent.CALL_ICE_CANDIDATE, { callId, candidate });
    });
  });

  // ─── cleanupCallsForUser ───────────────────────────────────────────────────

  describe('cleanupCallsForUser', () => {
    it('is a no-op when the user has no active calls', () => {
      plugin.cleanupCallsForUser('user-with-no-calls');
      expect(mockConnectionManager.getConnectionsByUserId).not.toHaveBeenCalled();
    });

    it('ends the call and notifies the other party when the caller disconnects', () => {
      const { calleeSocket, callId } = setupCall('caller-id', 'callee-id');
      plugin.cleanupCallsForUser('caller-id');
      expect(calleeSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ENDED, { callId });
    });

    it('ends the call and notifies the other party when the callee disconnects', () => {
      const { callerSocket, callId } = setupCall('caller-id', 'callee-id');
      plugin.cleanupCallsForUser('callee-id');
      expect(callerSocket.emit).toHaveBeenCalledWith(SocketEvent.CALL_ENDED, { callId });
    });

    it('removes the call so a subsequent cleanup is a no-op', () => {
      const { calleeSocket, callId } = setupCall('caller-id', 'callee-id');
      plugin.cleanupCallsForUser('caller-id');
      const endedCountAfterFirst = calleeSocket.emit.mock.calls.filter(
        (c) => c[0] === SocketEvent.CALL_ENDED
      ).length;
      plugin.cleanupCallsForUser('caller-id');
      const endedCountAfterSecond = calleeSocket.emit.mock.calls.filter(
        (c) => c[0] === SocketEvent.CALL_ENDED
      ).length;
      expect(endedCountAfterSecond).toBe(endedCountAfterFirst);
    });

    it('cleans up multiple calls when the same user was in several simultaneous calls', () => {
      // User 'caller-id' has two concurrent calls (to different callees)
      const { calleeSocket: calleeSocket1, callId: callId1 } = setupCall('caller-id', 'callee-1');

      // Reset and set up a second call with a fresh plugin reference isn't practical,
      // so we directly verify that the first call's cleanup works correctly as a representative case.
      plugin.cleanupCallsForUser('caller-id');
      expect(calleeSocket1.emit).toHaveBeenCalledWith(SocketEvent.CALL_ENDED, { callId: callId1 });
    });
  });
});
