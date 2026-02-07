import { ConnectionManager } from '../core/ConnectionManager';
import { Connection } from '../core/Connection';
import { User } from 'sockr-shared';
import { Socket } from 'socket.io';

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;
  let mockSocket: Partial<Socket>;
  let connection: Connection;

  beforeEach(() => {
    connectionManager = new ConnectionManager();
    mockSocket = {
      id: 'socket-123',
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    connection = new Connection(mockSocket as Socket);
  });

  describe('addConnection', () => {
    it('should add a connection', () => {
      connectionManager.addConnection(connection);
      expect(connectionManager.getConnection('socket-123')).toBe(connection);
    });
  });

  describe('removeConnection', () => {
    it('should remove a connection', () => {
      connectionManager.addConnection(connection);
      connectionManager.removeConnection('socket-123');
      expect(connectionManager.getConnection('socket-123')).toBeUndefined();
    });

    it('should remove user mapping when removing authenticated connection', () => {
      const user: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
      };

      connectionManager.addConnection(connection);
      connectionManager.authenticateConnection('socket-123', user);
      expect(connectionManager.isUserOnline('user-1')).toBe(true);

      connectionManager.removeConnection('socket-123');
      expect(connectionManager.isUserOnline('user-1')).toBe(false);
    });
  });

  describe('authenticateConnection', () => {
    it('should authenticate a connection', () => {
      const user: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
      };

      connectionManager.addConnection(connection);
      connectionManager.authenticateConnection('socket-123', user);

      expect(connection.isAuth()).toBe(true);
      expect(connectionManager.getConnectionByUserId('user-1')).toBe(connection);
    });
  });

  describe('isUserOnline', () => {
    it('should return false for offline user', () => {
      expect(connectionManager.isUserOnline('user-1')).toBe(false);
    });

    it('should return true for online user', () => {
      const user: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
      };

      connectionManager.addConnection(connection);
      connectionManager.authenticateConnection('socket-123', user);

      expect(connectionManager.isUserOnline('user-1')).toBe(true);
    });
  });

  describe('getUsersOnlineStatus', () => {
    it('should return online status for multiple users', () => {
      const user1: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
      };

      connectionManager.addConnection(connection);
      connectionManager.authenticateConnection('socket-123', user1);

      const statuses = connectionManager.getUsersOnlineStatus([
        'user-1',
        'user-2',
        'user-3',
      ]);

      expect(statuses).toEqual({
        'user-1': true,
        'user-2': false,
        'user-3': false,
      });
    });
  });

  describe('getOnlineUsers', () => {
    it('should return all online user IDs', () => {
      const user1: User = {
        id: 'user-1',
        socketId: 'socket-123',
        connectedAt: Date.now(),
      };

      const user2: User = {
        id: 'user-2',
        socketId: 'socket-456',
        connectedAt: Date.now(),
      };

      const mockSocket2: Partial<Socket> = {
        id: 'socket-456',
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      const connection2 = new Connection(mockSocket2 as Socket);

      connectionManager.addConnection(connection);
      connectionManager.addConnection(connection2);
      connectionManager.authenticateConnection('socket-123', user1);
      connectionManager.authenticateConnection('socket-456', user2);

      const onlineUsers = connectionManager.getOnlineUsers();
      expect(onlineUsers).toContain('user-1');
      expect(onlineUsers).toContain('user-2');
      expect(onlineUsers).toHaveLength(2);
    });
  });

  describe('getTotalConnections', () => {
    it('should return total number of connections', () => {
      expect(connectionManager.getTotalConnections()).toBe(0);

      connectionManager.addConnection(connection);
      expect(connectionManager.getTotalConnections()).toBe(1);

      const mockSocket2: Partial<Socket> = {
        id: 'socket-456',
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      const connection2 = new Connection(mockSocket2 as Socket);
      connectionManager.addConnection(connection2);
      expect(connectionManager.getTotalConnections()).toBe(2);
    });
  });
});