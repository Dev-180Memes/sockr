import { CallStatus, IceServer, IceCandidateInit, ActiveCall } from '../index';

describe('Call Types', () => {
  describe('CallStatus', () => {
    it('accepts all valid call status literals', () => {
      const statuses: CallStatus[] = [
        'initiating',
        'ringing',
        'active',
        'ended',
        'rejected',
        'busy',
      ];
      expect(statuses).toHaveLength(6);
      expect(statuses).toContain('initiating');
      expect(statuses).toContain('ringing');
      expect(statuses).toContain('active');
      expect(statuses).toContain('ended');
      expect(statuses).toContain('rejected');
      expect(statuses).toContain('busy');
    });
  });

  describe('IceServer', () => {
    it('accepts a STUN server with a single string URL', () => {
      const server: IceServer = { urls: 'stun:stun.example.com' };
      expect(server.urls).toBe('stun:stun.example.com');
      expect(server.username).toBeUndefined();
      expect(server.credential).toBeUndefined();
    });

    it('accepts a TURN server with HMAC-style credentials', () => {
      const server: IceServer = {
        urls: 'turn:turn.example.com',
        username: '1748000000:user-alice',
        credential: 'base64hmacvalue==',
      };
      expect(server.urls).toBe('turn:turn.example.com');
      expect(server.username).toBe('1748000000:user-alice');
      expect(server.credential).toBe('base64hmacvalue==');
    });

    it('accepts an array of URLs (multi-transport TURN)', () => {
      const server: IceServer = {
        urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:443?transport=tcp'],
        username: 'user',
        credential: 'cred',
      };
      expect(Array.isArray(server.urls)).toBe(true);
      expect((server.urls as string[]).length).toBe(2);
    });

    it('has the same required shape as RTCIceServer (urls + optional credentials)', () => {
      // IceServer mirrors RTCIceServer so it is safe to cast on the client side.
      // We verify the runtime shape here without importing DOM types.
      const server: IceServer = {
        urls: 'turn:turn.example.com',
        username: 'user',
        credential: 'cred',
      };
      expect(Object.keys(server)).toEqual(
        expect.arrayContaining(['urls', 'username', 'credential'])
      );
    });
  });

  describe('IceCandidateInit', () => {
    it('accepts a fully populated ICE candidate', () => {
      const candidate: IceCandidateInit = {
        candidate: 'candidate:1 1 udp 2113937151 192.168.0.1 51000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'frag123',
      };
      expect(candidate.candidate).toContain('candidate:');
      expect(candidate.sdpMid).toBe('0');
      expect(candidate.sdpMLineIndex).toBe(0);
      expect(candidate.usernameFragment).toBe('frag123');
    });

    it('allows all optional fields to be null (per WebRTC spec)', () => {
      const candidate: IceCandidateInit = {
        candidate: 'candidate:...',
        sdpMid: null,
        sdpMLineIndex: null,
        usernameFragment: null,
      };
      expect(candidate.sdpMid).toBeNull();
      expect(candidate.sdpMLineIndex).toBeNull();
      expect(candidate.usernameFragment).toBeNull();
    });

    it('allows an empty object as end-of-candidates indicator', () => {
      const candidate: IceCandidateInit = {};
      expect(candidate.candidate).toBeUndefined();
    });
  });

  describe('ActiveCall', () => {
    it('creates a valid ringing call object', () => {
      const now = Date.now();
      const call: ActiveCall = {
        callId: 'call-uuid-123',
        callerId: 'user-alice',
        calleeId: 'user-bob',
        status: 'ringing',
        startedAt: now,
      };
      expect(call.callId).toBe('call-uuid-123');
      expect(call.callerId).toBe('user-alice');
      expect(call.calleeId).toBe('user-bob');
      expect(call.status).toBe('ringing');
      expect(call.startedAt).toBe(now);
    });

    it('accepts all valid CallStatus values for status field', () => {
      const base = { callId: 'id', callerId: 'a', calleeId: 'b', startedAt: 0 };
      const statuses: CallStatus[] = ['initiating', 'ringing', 'active', 'ended', 'rejected', 'busy'];
      for (const status of statuses) {
        const call: ActiveCall = { ...base, status };
        expect(call.status).toBe(status);
      }
    });

    it('startedAt holds a Unix millisecond timestamp', () => {
      const before = Date.now();
      const call: ActiveCall = {
        callId: 'id',
        callerId: 'a',
        calleeId: 'b',
        status: 'active',
        startedAt: Date.now(),
      };
      const after = Date.now();
      expect(call.startedAt).toBeGreaterThanOrEqual(before);
      expect(call.startedAt).toBeLessThanOrEqual(after);
    });
  });
});
