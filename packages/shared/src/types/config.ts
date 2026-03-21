import { ICacheProvider } from "../interfaces/ICacheProvider";
import { IMessageStore } from "../interfaces/IMessageStore";
import { IQueueProvider } from "../interfaces/IQueueProvider";

export interface ServerConfig {
  port?: number;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  pingTimeout?: number;
  pingInterval?: number;
  transports?: ('websocket' | 'polling')[];
  providers?: {
    messageStore?: IMessageStore;
    queue?: IQueueProvider;
    cache?: ICacheProvider;
  }
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