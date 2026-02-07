export interface ServerConfig {
  port?: number;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  pingTimeout?: number;
  pingInterval?: number;
  transports?: ('websocket' | 'polling')[];
}

export interface ClientConfig {
  url: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
  transports?: ('websocket' | 'polling')[];
}