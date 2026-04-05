/**
 * Tests for SocketClient voice and conference methods.
 *
 * These tests verify that the client correctly emits the right socket events
 * with the right payloads — the layer that useVoiceCall and useConferenceCall
 * delegate to. Browser APIs (RTCPeerConnection, getUserMedia) and SFU SDK
 * internals are covered separately in integration/E2E tests.
 */

import { SocketEvent } from 'sockr-shared';
import { SocketClient } from '../core/SocketClient';

// ─── Mock socket.io-client ────────────────────────────────────────────────────

const mockEmit = jest.fn();
const mockOn = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    connected: true,
    emit: mockEmit,
    on: mockOn,
    off: jest.fn(),
    disconnect: mockDisconnect,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a SocketClient whose internal socket is already authenticated.
 * We patch the connection manager state directly so guard assertions pass.
 */
function makeAuthenticatedClient(): SocketClient {
  const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
  // Reach in and fire the connect + authenticated event handlers that the
  // real socket would fire, so isAuthenticated() returns true.
  const onCalls: Array<[string, Function]> = mockOn.mock.calls;
  const callHandler = (event: string, payload?: any) => {
    const entry = onCalls.find(([e]) => e === event);
    entry?.[1](payload);
  };
  // Force connection state to AUTHENTICATED by simulating the lifecycle
  client.connect();
  callHandler('connect');
  callHandler(SocketEvent.AUTHENTICATED, { userId: 'user-1', socketId: 'sock-1' });
  return client;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SocketClient — voice calling methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The mocked socket is always "connected"
    const { io } = require('socket.io-client');
    io.mockReturnValue({
      connected: true,
      emit: mockEmit,
      on: mockOn,
      off: jest.fn(),
      disconnect: mockDisconnect,
    });
  });

  // ─── getIceServers ─────────────────────────────────────────────────────────

  describe('getIceServers', () => {
    it('emits CALL_GET_ICE_SERVERS when authenticated', () => {
      const client = makeAuthenticatedClient();
      client.getIceServers();
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CALL_GET_ICE_SERVERS, {});
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() => client.getIceServers()).toThrow();
    });
  });

  // ─── initiateCall ──────────────────────────────────────────────────────────

  describe('initiateCall', () => {
    it('emits CALL_INITIATE with to and sdpOffer', () => {
      const client = makeAuthenticatedClient();
      client.initiateCall('bob', 'offer-sdp-string');
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CALL_INITIATE, {
        to: 'bob',
        sdpOffer: 'offer-sdp-string',
      });
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() => client.initiateCall('bob', 'offer')).toThrow();
    });
  });

  // ─── answerCall ────────────────────────────────────────────────────────────

  describe('answerCall', () => {
    it('emits CALL_ANSWER with callId and sdpAnswer', () => {
      const client = makeAuthenticatedClient();
      client.answerCall('call-123', 'answer-sdp');
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CALL_ANSWER, {
        callId: 'call-123',
        sdpAnswer: 'answer-sdp',
      });
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() => client.answerCall('call-123', 'answer')).toThrow();
    });
  });

  // ─── rejectCall ────────────────────────────────────────────────────────────

  describe('rejectCall', () => {
    it('emits CALL_REJECT with callId', () => {
      const client = makeAuthenticatedClient();
      client.rejectCall('call-123');
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CALL_REJECT, { callId: 'call-123' });
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() => client.rejectCall('call-123')).toThrow();
    });
  });

  // ─── hangUp ────────────────────────────────────────────────────────────────

  describe('hangUp', () => {
    it('emits CALL_HANGUP with callId', () => {
      const client = makeAuthenticatedClient();
      client.hangUp('call-456');
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CALL_HANGUP, { callId: 'call-456' });
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() => client.hangUp('call-456')).toThrow();
    });
  });

  // ─── sendIceCandidate ──────────────────────────────────────────────────────

  describe('sendIceCandidate', () => {
    it('emits CALL_ICE_CANDIDATE with callId and candidate', () => {
      const client = makeAuthenticatedClient();
      const candidate = { candidate: 'cand-string', sdpMid: '0', sdpMLineIndex: 0 };
      client.sendIceCandidate('call-789', candidate as any);
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CALL_ICE_CANDIDATE, {
        callId: 'call-789',
        candidate,
      });
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() =>
        client.sendIceCandidate('call-789', { candidate: 'c' } as any)
      ).toThrow();
    });
  });

  // ─── Incoming call event forwarding ────────────────────────────────────────

  describe('incoming call event forwarding', () => {
    it('forwards call_incoming from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_incoming', handler);

      // Simulate the socket firing the event
      const callIncomingCb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CALL_INCOMING
      )?.[1];
      const payload = { callId: 'c1', from: 'alice', sdpOffer: 'offer', iceServers: [] };
      callIncomingCb?.(payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('forwards call_ringing from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_ringing', handler);

      const cb = mockOn.mock.calls.find(([e]: [string]) => e === SocketEvent.CALL_RINGING)?.[1];
      cb?.({ callId: 'c1' });

      expect(handler).toHaveBeenCalledWith({ callId: 'c1' });
    });

    it('forwards call_answered from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_answered', handler);

      const cb = mockOn.mock.calls.find(([e]: [string]) => e === SocketEvent.CALL_ANSWERED)?.[1];
      cb?.({ callId: 'c1', sdpAnswer: 'answer' });

      expect(handler).toHaveBeenCalledWith({ callId: 'c1', sdpAnswer: 'answer' });
    });

    it('forwards call_rejected from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_rejected', handler);

      const cb = mockOn.mock.calls.find(([e]: [string]) => e === SocketEvent.CALL_REJECTED)?.[1];
      cb?.({ callId: 'c1' });

      expect(handler).toHaveBeenCalledWith({ callId: 'c1' });
    });

    it('forwards call_ended from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_ended', handler);

      const cb = mockOn.mock.calls.find(([e]: [string]) => e === SocketEvent.CALL_ENDED)?.[1];
      cb?.({ callId: 'c1' });

      expect(handler).toHaveBeenCalledWith({ callId: 'c1' });
    });

    it('forwards call_busy from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_busy', handler);

      const cb = mockOn.mock.calls.find(([e]: [string]) => e === SocketEvent.CALL_BUSY)?.[1];
      cb?.({ callId: 'c1' });

      expect(handler).toHaveBeenCalledWith({ callId: 'c1' });
    });

    it('forwards call_ice_candidate from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_ice_candidate', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CALL_ICE_CANDIDATE
      )?.[1];
      const payload = { callId: 'c1', candidate: { candidate: 'c' } };
      cb?.(payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('forwards call_ice_servers from socket to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('call_ice_servers', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CALL_ICE_SERVERS
      )?.[1];
      cb?.({ iceServers: [{ urls: 'stun:stun.example.com' }] });

      expect(handler).toHaveBeenCalledWith({
        iceServers: [{ urls: 'stun:stun.example.com' }],
      });
    });
  });
});

// ─── Conference calling methods ────────────────────────────────────────────────

describe('SocketClient — conference calling methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { io } = require('socket.io-client');
    io.mockReturnValue({
      connected: true,
      emit: mockEmit,
      on: mockOn,
      off: jest.fn(),
      disconnect: mockDisconnect,
    });
  });

  // ─── joinConference ────────────────────────────────────────────────────────

  describe('joinConference', () => {
    it('emits CONFERENCE_JOIN with groupId', () => {
      const client = makeAuthenticatedClient();
      client.joinConference('group-abc');
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_JOIN, {
        groupId: 'group-abc',
      });
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() => client.joinConference('group-abc')).toThrow();
    });
  });

  // ─── leaveConference ───────────────────────────────────────────────────────

  describe('leaveConference', () => {
    it('emits CONFERENCE_LEAVE with groupId', () => {
      const client = makeAuthenticatedClient();
      client.leaveConference('group-abc');
      expect(mockEmit).toHaveBeenCalledWith(SocketEvent.CONFERENCE_LEAVE, {
        groupId: 'group-abc',
      });
    });

    it('throws when not authenticated', () => {
      const client = new SocketClient({ url: 'http://localhost:3000', autoConnect: false });
      expect(() => client.leaveConference('group-abc')).toThrow();
    });
  });

  // ─── Conference event forwarding ───────────────────────────────────────────

  describe('conference event forwarding', () => {
    it('forwards conference_token to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('conference_token', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CONFERENCE_TOKEN
      )?.[1];
      const payload = { groupId: 'g1', sfuUrl: 'wss://sfu.example.com', token: 'tok' };
      cb?.(payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('forwards conference_started to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('conference_started', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CONFERENCE_STARTED
      )?.[1];
      cb?.({ groupId: 'g1', startedBy: 'user-1', participantCount: 1 });

      expect(handler).toHaveBeenCalledWith({
        groupId: 'g1',
        startedBy: 'user-1',
        participantCount: 1,
      });
    });

    it('forwards conference_ended to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('conference_ended', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CONFERENCE_ENDED
      )?.[1];
      cb?.({ groupId: 'g1' });

      expect(handler).toHaveBeenCalledWith({ groupId: 'g1' });
    });

    it('forwards conference_participant_joined to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('conference_participant_joined', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CONFERENCE_PARTICIPANT_JOINED
      )?.[1];
      cb?.({ groupId: 'g1', userId: 'user-2', participantCount: 2 });

      expect(handler).toHaveBeenCalledWith({
        groupId: 'g1',
        userId: 'user-2',
        participantCount: 2,
      });
    });

    it('forwards conference_participant_left to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('conference_participant_left', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CONFERENCE_PARTICIPANT_LEFT
      )?.[1];
      cb?.({ groupId: 'g1', userId: 'user-2', participantCount: 1 });

      expect(handler).toHaveBeenCalledWith({
        groupId: 'g1',
        userId: 'user-2',
        participantCount: 1,
      });
    });

    it('forwards conference_error to event emitter', () => {
      const client = makeAuthenticatedClient();
      const handler = jest.fn();
      client.on('conference_error', handler);

      const cb = mockOn.mock.calls.find(
        ([e]: [string]) => e === SocketEvent.CONFERENCE_ERROR
      )?.[1];
      cb?.({ groupId: 'g1', error: 'Not a member of this group' });

      expect(handler).toHaveBeenCalledWith({
        groupId: 'g1',
        error: 'Not a member of this group',
      });
    });
  });
});
