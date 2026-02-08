import { io, Socket } from 'socket.io-client';
import {
  ClientConfig,
  SocketEvent,
  EventPayloads,
  Message,
} from 'sockr-shared';
import { EventEmitter } from './EventEmitter';
import { ConnectionManager, ConnectionState } from './ConnectionManager';

export class SocketClient {
  private socket: Socket | null = null;
  private config: ClientConfig;
  private eventEmitter: EventEmitter;
  private connectionManager: ConnectionManager;
  private userId: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: ClientConfig) {
    this.config = {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      ...config,
    };

    this.eventEmitter = new EventEmitter();
    this.connectionManager = new ConnectionManager(
      this.config.reconnectionAttempts
    );

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  public connect(): void {
    if (this.socket?.connected) {
      console.warn('Socket already connected');
      return;
    }

    this.connectionManager.setState(ConnectionState.CONNECTING);

    this.socket = io(this.config.url, {
      autoConnect: true,
      reconnection: false, // We'll handle reconnection ourselves
      timeout: this.config.timeout,
      transports: this.config.transports,
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.connectionManager.setState(ConnectionState.CONNECTED);
      this.connectionManager.resetReconnectAttempts();
      this.eventEmitter.emit('connect');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.connectionManager.setState(ConnectionState.DISCONNECTED);
      this.userId = null;
      this.eventEmitter.emit('disconnect', reason);

      if (this.config.reconnection && this.shouldReconnect(reason)) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.connectionManager.setState(ConnectionState.ERROR);
      this.eventEmitter.emit('error', error);

      if (this.config.reconnection) {
        this.scheduleReconnect();
      }
    });

    // Authentication events
    this.socket.on(
      SocketEvent.AUTHENTICATED,
      (data: EventPayloads[SocketEvent.AUTHENTICATED]) => {
        console.log('Authenticated:', data.userId);
        this.userId = data.userId;
        this.connectionManager.setState(ConnectionState.AUTHENTICATED);
        this.eventEmitter.emit('authenticated', data);
      }
    );

    this.socket.on(
      SocketEvent.AUTH_ERROR,
      (data: EventPayloads[SocketEvent.AUTH_ERROR]) => {
        console.error('Authentication error:', data.message);
        this.eventEmitter.emit('auth_error', data);
      }
    );

    // Presence events
    this.socket.on(
      SocketEvent.USER_ONLINE,
      (data: EventPayloads[SocketEvent.USER_ONLINE]) => {
        this.eventEmitter.emit('user_online', data);
      }
    );

    this.socket.on(
      SocketEvent.USER_OFFLINE,
      (data: EventPayloads[SocketEvent.USER_OFFLINE]) => {
        this.eventEmitter.emit('user_offline', data);
      }
    );

    this.socket.on(
      SocketEvent.ONLINE_STATUS,
      (data: EventPayloads[SocketEvent.ONLINE_STATUS]) => {
        this.eventEmitter.emit('online_status', data);
      }
    );

    // Message events
    this.socket.on(
      SocketEvent.RECEIVE_MESSAGE,
      (data: EventPayloads[SocketEvent.RECEIVE_MESSAGE]) => {
        this.eventEmitter.emit('message', data);
      }
    );

    this.socket.on(
      SocketEvent.MESSAGE_DELIVERED,
      (data: EventPayloads[SocketEvent.MESSAGE_DELIVERED]) => {
        this.eventEmitter.emit('message_delivered', data);
      }
    );

    this.socket.on(
      SocketEvent.MESSAGE_ERROR,
      (data: EventPayloads[SocketEvent.MESSAGE_ERROR]) => {
        this.eventEmitter.emit('message_error', data);
      }
    );

    // Typing events
    this.socket.on(
      SocketEvent.TYPING_START,
      (data: EventPayloads[SocketEvent.TYPING_START]) => {
        this.eventEmitter.emit('typing_start', data);
      }
    );

    this.socket.on(
      SocketEvent.TYPING_STOP,
      (data: EventPayloads[SocketEvent.TYPING_STOP]) => {
        this.eventEmitter.emit('typing_stop', data);
      }
    );
  }

  private shouldReconnect(reason: string): boolean {
    // Don't reconnect if disconnect was intentional
    return reason !== 'io client disconnect' && 
           this.connectionManager.canReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const attempt = this.connectionManager.incrementReconnectAttempts();
    const delay = this.config.reconnectionDelay! * attempt;

    console.log(`Scheduling reconnect attempt ${attempt} in ${delay}ms`);
    this.connectionManager.setState(ConnectionState.RECONNECTING);

    this.reconnectTimer = setTimeout(() => {
      console.log(`Reconnect attempt ${attempt}`);
      this.connect();
    }, delay);
  }

  public authenticate(token: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected. Call connect() first.');
    }

    this.socket.emit(SocketEvent.AUTHENTICATE, {
      token,
    } as EventPayloads[SocketEvent.AUTHENTICATE]);
  }

  public sendMessage(
    to: string,
    content: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    this.socket!.emit(SocketEvent.SEND_MESSAGE, {
      to,
      content,
      metadata,
    } as EventPayloads[SocketEvent.SEND_MESSAGE]);
  }

  public getOnlineStatus(userIds: string[]): void {
    if (!this.isConnected()) {
      throw new Error('Not connected.');
    }

    this.socket!.emit(SocketEvent.GET_ONLINE_STATUS, {
      userIds,
    } as EventPayloads[SocketEvent.GET_ONLINE_STATUS]);
  }

  public startTyping(to: string): void {
    if (!this.isAuthenticated()) return;

    this.socket!.emit(SocketEvent.TYPING_START, { to });
  }

  public stopTyping(to: string): void {
    if (!this.isAuthenticated()) return;

    this.socket!.emit(SocketEvent.TYPING_STOP, { to });
  }

  public on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventEmitter.on(event, handler);
  }

  public off(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.connectionManager.reset();
    this.userId = null;
  }

  public isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  public isAuthenticated(): boolean {
    return this.connectionManager.isAuthenticated();
  }

  public getConnectionState(): ConnectionState {
    return this.connectionManager.getState();
  }

  public getUserId(): string | null {
    return this.userId;
  }

  public onStateChange(
    listener: (state: ConnectionState) => void
  ): () => void {
    return this.connectionManager.onStateChange(listener);
  }
}