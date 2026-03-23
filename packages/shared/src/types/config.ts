import { ICacheProvider } from "../interfaces/ICacheProvider";
import { IMessageStore } from "../interfaces/IMessageStore";
import { IQueueProvider } from "../interfaces/IQueueProvider";
import { IceServer } from "./call";

export interface TurnConfig {
  /** TURN server URL(s), e.g. "turn:turn.example.com:3478" */
  urls: string | string[];
  /** The static-auth-secret configured in your Coturn turnserver.conf */
  secret: string;
  /** Credential lifetime in seconds. Defaults to 3600 (1 hour). */
  ttl?: number;
}

export interface VoiceConfig {
  /** Static ICE servers (e.g. a public STUN). Always included as-is. */
  iceServers?: IceServer[];
  /**
   * Coturn connection details. When provided, Sockr generates short-lived
   * HMAC-SHA1 credentials per user and injects them into call events —
   * the TURN secret never reaches the client.
   */
  turn?: TurnConfig;
}

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
  };
  /** Voice calling configuration. Required to enable the VoicePlugin. */
  voice?: VoiceConfig;
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