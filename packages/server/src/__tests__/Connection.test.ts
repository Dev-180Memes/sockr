import { Connection } from '../core/Connection';
import { User } from 'sockr-shared';
import { Socket } from 'socket.io';

describe('Connection', () => {
  let mockSocket: Partial<Socket>;
  let connection: Connection;

  beforeEach(() => {
    mockSocket = {
      id: 'socket-123',
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    connection = new Connection(mockSocket as Socket);
  });

  describe('authenticate', () => {
    it('should authenticate a user', () => {
      const user: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
      };

      connection.authenticate(user);

      expect(connection.isAuth()).toBe(true);
      expect(connection.getUser()).toEqual(user);
      expect(connection.getUserId()).toBe('user-1');
    });
  });

  describe('getSocketId', () => {
    it('should return socket id', () => {
      expect(connection.getSocketId()).toBe('socket-123');
    });
  });

  describe('emit', () => {
    it('should emit event to socket', () => {
      connection.emit('test-event', { data: 'test' });
      expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' });
    });
  });

  describe('disconnect', () => {
    it('should disconnect socket', () => {
      connection.disconnect();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('isAuth', () => {
    it('should return false when not authenticated', () => {
      expect(connection.isAuth()).toBe(false);
    });

    it('should return true when authenticated', () => {
      const user: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
      };
      connection.authenticate(user);
      expect(connection.isAuth()).toBe(true);
    });
  });
});