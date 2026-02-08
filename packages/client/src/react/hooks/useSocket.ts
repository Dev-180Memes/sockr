import { useSocketContext } from '../context/SocketContext';
import { SocketClient } from '../../core/SocketClient';
import { ConnectionState } from '../../core/ConnectionManager';

interface UseSocketReturn {
  client: SocketClient | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  connectionState: ConnectionState;
  userId: string | null;
}

export const useSocket = (): UseSocketReturn => {
  const context = useSocketContext();
  
  return {
    client: context.client,
    isConnected: context.isConnected,
    isAuthenticated: context.isAuthenticated,
    connectionState: context.connectionState,
    userId: context.userId,
  };
};