import { useEffect } from 'react';
import { useSocketContext } from '../context/SocketContext';

export const useSocketEvent = (
  event: string,
  handler: (...args: any[]) => void,
  deps: React.DependencyList = []
): void => {
  const { client } = useSocketContext();

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.on(event, handler);

    return () => {
      unsubscribe();
    };
  }, [client, event, ...deps]);
};