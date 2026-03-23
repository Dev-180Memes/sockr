import { SocketEvent, EventPayloads, Message, User } from '../index';

describe('Shared Types', () => {
  describe('SocketEvent', () => {
    it('should have all required events', () => {
      expect(SocketEvent.CONNECT).toBe('connect');
      expect(SocketEvent.DISCONNECT).toBe('disconnect');
      expect(SocketEvent.AUTHENTICATE).toBe('authenticate');
      expect(SocketEvent.SEND_MESSAGE).toBe('send_message');
      expect(SocketEvent.RECEIVE_MESSAGE).toBe('receive_message');
    });

    it('should have all voice call signaling events', () => {
      expect(SocketEvent.CALL_GET_ICE_SERVERS).toBe('call_get_ice_servers');
      expect(SocketEvent.CALL_ICE_SERVERS).toBe('call_ice_servers');
      expect(SocketEvent.CALL_INITIATE).toBe('call_initiate');
      expect(SocketEvent.CALL_INCOMING).toBe('call_incoming');
      expect(SocketEvent.CALL_RINGING).toBe('call_ringing');
      expect(SocketEvent.CALL_ANSWER).toBe('call_answer');
      expect(SocketEvent.CALL_ANSWERED).toBe('call_answered');
      expect(SocketEvent.CALL_REJECT).toBe('call_reject');
      expect(SocketEvent.CALL_REJECTED).toBe('call_rejected');
      expect(SocketEvent.CALL_HANGUP).toBe('call_hangup');
      expect(SocketEvent.CALL_ENDED).toBe('call_ended');
      expect(SocketEvent.CALL_BUSY).toBe('call_busy');
      expect(SocketEvent.CALL_ICE_CANDIDATE).toBe('call_ice_candidate');
    });
  });

  describe('EventPayloads', () => {
    it('should have correct authenticate payload structure', () => {
      const payload: EventPayloads[SocketEvent.AUTHENTICATE] = {
        token: 'test-token',
      };
      expect(payload.token).toBe('test-token');
    });

    it('should have correct send message payload structure', () => {
      const payload: EventPayloads[SocketEvent.SEND_MESSAGE] = {
        to: 'user-123',
        content: 'Hello',
        metadata: { type: 'text' },
      };
      expect(payload.to).toBe('user-123');
      expect(payload.content).toBe('Hello');
      expect(payload.metadata?.type).toBe('text');
    });

    it('should have correct CALL_INITIATE payload structure', () => {
      const payload: EventPayloads[SocketEvent.CALL_INITIATE] = {
        to: 'user-123',
        sdpOffer: 'v=0\r\no=- ...',
      };
      expect(payload.to).toBe('user-123');
      expect(payload.sdpOffer).toContain('v=0');
    });

    it('should have correct CALL_INCOMING payload structure', () => {
      const payload: EventPayloads[SocketEvent.CALL_INCOMING] = {
        callId: 'call-uuid',
        from: 'user-abc',
        sdpOffer: 'v=0\r\no=- ...',
        iceServers: [{ urls: 'stun:stun.example.com' }],
      };
      expect(payload.callId).toBe('call-uuid');
      expect(payload.from).toBe('user-abc');
      expect(payload.iceServers).toHaveLength(1);
    });

    it('should have correct CALL_ANSWER payload structure', () => {
      const payload: EventPayloads[SocketEvent.CALL_ANSWER] = {
        callId: 'call-uuid',
        sdpAnswer: 'v=0\r\no=- ...',
      };
      expect(payload.callId).toBe('call-uuid');
      expect(payload.sdpAnswer).toContain('v=0');
    });

    it('should have correct CALL_ICE_CANDIDATE payload structure', () => {
      const payload: EventPayloads[SocketEvent.CALL_ICE_CANDIDATE] = {
        callId: 'call-uuid',
        candidate: {
          candidate: 'candidate:1 1 udp 2113937151 192.168.0.1 51000 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      };
      expect(payload.callId).toBe('call-uuid');
      expect(payload.candidate.candidate).toContain('candidate:');
    });
  });

  describe('Message', () => {
    it('should create a valid message', () => {
      const message: Message = {
        id: 'msg-1',
        from: 'user-1',
        to: 'user-2',
        content: 'Test message',
        timestamp: Date.now(),
        delivered: false,
      };

      expect(message.id).toBe('msg-1');
      expect(message.from).toBe('user-1');
      expect(message.to).toBe('user-2');
      expect(message.delivered).toBe(false);
    });
  });

  describe('User', () => {
    it('should create a valid user', () => {
      const user: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
        metadata: { name: 'John' },
      };

      expect(user.id).toBe('user-1');
      expect(user.socketId).toBe('socket-123');
      expect(user.metadata?.name).toBe('John');
    });
  });
});