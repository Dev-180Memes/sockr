import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { SocketClient } from '../../core/SocketClient';
import { ClientConfig } from 'sockr-shared';
import { ConnectionState } from '../../core/ConnectionManager';

interface SocketContextValue {
  client: SocketClient | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  connectionState: ConnectionState;
  userId: string | null;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

interface SocketProviderProps {
  config: ClientConfig;
  token?: string;
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({
  config,
  token,
  children,
}) => {
  const clientRef = useRef<SocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED
  );
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Initialize client
    const client = new SocketClient(config);
    clientRef.current = client;

    // Setup event listeners
    const unsubscribeConnect = client.on('connect', () => {
      setIsConnected(true);
      
      // Auto-authenticate if token provided
      if (token) {
        client.authenticate(token);
      }
    });

    const unsubscribeDisconnect = client.on('disconnect', () => {
      setIsConnected(false);
      setIsAuthenticated(false);
      setUserId(null);
    });

    const unsubscribeAuthenticated = client.on('authenticated', (data: any) => {
      setIsAuthenticated(true);
      setUserId(data.userId);
    });

    const unsubscribeAuthError = client.on('auth_error', () => {
      setIsAuthenticated(false);
      setUserId(null);
    });

    const unsubscribeStateChange = client.onStateChange((state) => {
      setConnectionState(state);
    });

    // Cleanup
    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeAuthenticated();
      unsubscribeAuthError();
      unsubscribeStateChange();
      client.disconnect();
    };
  }, [config.url, token]);

  const value: SocketContextValue = {
    client: clientRef.current,
    isConnected,
    isAuthenticated,
    connectionState,
    userId,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = (): SocketContextValue => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within SocketProvider');
  }
  return context;
};