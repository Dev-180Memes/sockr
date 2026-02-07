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