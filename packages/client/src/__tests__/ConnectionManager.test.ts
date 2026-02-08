import { ConnectionManager, ConnectionState } from '../core/ConnectionManager';

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager(5);
  });

  describe('getState', () => {
    it('should return initial state as DISCONNECTED', () => {
      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('setState', () => {
    it('should update state', () => {
      manager.setState(ConnectionState.CONNECTED);
      expect(manager.getState()).toBe(ConnectionState.CONNECTED);
    });

    it('should notify listeners on state change', () => {
      const listener = jest.fn();
      manager.onStateChange(listener);
      
      manager.setState(ConnectionState.CONNECTED);
      expect(listener).toHaveBeenCalledWith(ConnectionState.CONNECTED);
    });

    it('should not notify listeners if state does not change', () => {
      const listener = jest.fn();
      manager.setState(ConnectionState.CONNECTED);
      manager.onStateChange(listener);
      
      manager.setState(ConnectionState.CONNECTED);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true when CONNECTED', () => {
      manager.setState(ConnectionState.CONNECTED);
      expect(manager.isConnected()).toBe(true);
    });

    it('should return true when AUTHENTICATED', () => {
      manager.setState(ConnectionState.AUTHENTICATED);
      expect(manager.isConnected()).toBe(true);
    });

    it('should return false when DISCONNECTED', () => {
      manager.setState(ConnectionState.DISCONNECTED);
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should return true only when AUTHENTICATED', () => {
      manager.setState(ConnectionState.AUTHENTICATED);
      expect(manager.isAuthenticated()).toBe(true);
      
      manager.setState(ConnectionState.CONNECTED);
      expect(manager.isAuthenticated()).toBe(false);
    });
  });

  describe('reconnect attempts', () => {
    it('should increment reconnect attempts', () => {
      expect(manager.getReconnectAttempts()).toBe(0);
      
      manager.incrementReconnectAttempts();
      expect(manager.getReconnectAttempts()).toBe(1);
      
      manager.incrementReconnectAttempts();
      expect(manager.getReconnectAttempts()).toBe(2);
    });

    it('should reset reconnect attempts', () => {
      manager.incrementReconnectAttempts();
      manager.incrementReconnectAttempts();
      expect(manager.getReconnectAttempts()).toBe(2);
      
      manager.resetReconnectAttempts();
      expect(manager.getReconnectAttempts()).toBe(0);
    });

    it('should check if can reconnect', () => {
      expect(manager.canReconnect()).toBe(true);
      
      // Exhaust reconnect attempts
      for (let i = 0; i < 5; i++) {
        manager.incrementReconnectAttempts();
      }
      
      expect(manager.canReconnect()).toBe(false);
    });
  });

  describe('onStateChange', () => {
    it('should return cleanup function', () => {
      const listener = jest.fn();
      const cleanup = manager.onStateChange(listener);
      
      manager.setState(ConnectionState.CONNECTED);
      expect(listener).toHaveBeenCalledTimes(1);
      
      cleanup();
      manager.setState(ConnectionState.DISCONNECTED);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      manager.onStateChange(errorListener);
      manager.onStateChange(normalListener);
      
      manager.setState(ConnectionState.CONNECTED);
      
      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const listener = jest.fn();
      manager.onStateChange(listener);
      manager.setState(ConnectionState.AUTHENTICATED);
      manager.incrementReconnectAttempts();
      
      manager.reset();

      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(manager.getReconnectAttempts()).toBe(0);

      listener.mockClear();
      manager.setState(ConnectionState.CONNECTED);
      expect(listener).not.toHaveBeenCalled(); // Listeners should be cleared
    });
  });
});