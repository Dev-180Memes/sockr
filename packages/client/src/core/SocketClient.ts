import { io, Socket } from 'socket.io-client';
import {
  ClientConfig,
  SocketEvent,
  EventPayloads,
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
      transports: ['websocket'],
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

  // ─── Connection ────────────────────────────────────────────────────────────

  public connect(): void {
    if (this.socket?.connected) {
      console.warn('[Sockr] Socket already connected');
      return;
    }

    this.connectionManager.setState(ConnectionState.CONNECTING);

    this.socket = io(this.config.url, {
      autoConnect: true,
      reconnection: false,
      timeout: this.config.timeout,
      transports: this.config.transports,
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    // ── Core connection events ────────────────────────────────────────────────
    this.socket.on('connect', () => {
      this.connectionManager.setState(ConnectionState.CONNECTED);
      this.connectionManager.resetReconnectAttempts();
      this.eventEmitter.emit('connect');
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionManager.setState(ConnectionState.DISCONNECTED);
      this.userId = null;
      this.eventEmitter.emit('disconnect', reason);

      if (this.config.reconnection && this.shouldReconnect(reason)) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      this.connectionManager.setState(ConnectionState.ERROR);
      this.eventEmitter.emit('error', error);

      if (this.config.reconnection) {
        this.scheduleReconnect();
      }
    });

    // ── Auth events ───────────────────────────────────────────────────────────
    this.socket.on(
      SocketEvent.AUTHENTICATED,
      (data: EventPayloads[SocketEvent.AUTHENTICATED]) => {
        this.userId = data.userId;
        this.connectionManager.setState(ConnectionState.AUTHENTICATED);
        this.eventEmitter.emit('authenticated', data);
      }
    );

    this.socket.on(
      SocketEvent.AUTH_ERROR,
      (data: EventPayloads[SocketEvent.AUTH_ERROR]) => {
        this.eventEmitter.emit('auth_error', data);
      }
    );

    // ── Presence events ───────────────────────────────────────────────────────
    this.socket.on(SocketEvent.USER_ONLINE, (data: EventPayloads[SocketEvent.USER_ONLINE]) => {
      this.eventEmitter.emit('user_online', data);
    });

    this.socket.on(SocketEvent.USER_OFFLINE, (data: EventPayloads[SocketEvent.USER_OFFLINE]) => {
      this.eventEmitter.emit('user_offline', data);
    });

    this.socket.on(SocketEvent.ONLINE_STATUS, (data: EventPayloads[SocketEvent.ONLINE_STATUS]) => {
      this.eventEmitter.emit('online_status', data);
    });

    // ── 1:1 message events ────────────────────────────────────────────────────
    this.socket.on(SocketEvent.RECEIVE_MESSAGE, (data: EventPayloads[SocketEvent.RECEIVE_MESSAGE]) => {
      this.eventEmitter.emit('message', data);
    });

    this.socket.on(SocketEvent.MESSAGE_DELIVERED, (data: EventPayloads[SocketEvent.MESSAGE_DELIVERED]) => {
      this.eventEmitter.emit('message_delivered', data);
    });

    this.socket.on(SocketEvent.MESSAGE_READ, (data: EventPayloads[SocketEvent.MESSAGE_READ]) => {
      this.eventEmitter.emit('message_read', data);
    });

    this.socket.on(SocketEvent.MESSAGE_ERROR, (data: EventPayloads[SocketEvent.MESSAGE_ERROR]) => {
      this.eventEmitter.emit('message_error', data);
    });

    this.socket.on(SocketEvent.TYPING_START, (data: EventPayloads[SocketEvent.TYPING_START]) => {
      this.eventEmitter.emit('typing_start', data);
    });

    this.socket.on(SocketEvent.TYPING_STOP, (data: EventPayloads[SocketEvent.TYPING_STOP]) => {
      this.eventEmitter.emit('typing_stop', data);
    });

    this.socket.on(SocketEvent.MESSAGE_HISTORY, (data: EventPayloads[SocketEvent.MESSAGE_HISTORY]) => {
      this.eventEmitter.emit('message_history', data);
    });

    // ── Group management events ───────────────────────────────────────────────
    this.socket.on(SocketEvent.GROUP_CREATED, (data: EventPayloads[SocketEvent.GROUP_CREATED]) => {
      this.eventEmitter.emit('group_created', data);
    });

    this.socket.on(SocketEvent.GROUP_CREATE_ERROR, (data: EventPayloads[SocketEvent.GROUP_CREATE_ERROR]) => {
      this.eventEmitter.emit('group_create_error', data);
    });

    this.socket.on(SocketEvent.GROUP_JOINED, (data: EventPayloads[SocketEvent.GROUP_JOINED]) => {
      this.eventEmitter.emit('group_joined', data);
    });

    this.socket.on(SocketEvent.GROUP_JOIN_ERROR, (data: EventPayloads[SocketEvent.GROUP_JOIN_ERROR]) => {
      this.eventEmitter.emit('group_join_error', data);
    });

    this.socket.on(SocketEvent.GROUP_LEFT, (data: EventPayloads[SocketEvent.GROUP_LEFT]) => {
      this.eventEmitter.emit('group_left', data);
    });

    this.socket.on(SocketEvent.GROUP_MEMBER_JOINED, (data: EventPayloads[SocketEvent.GROUP_MEMBER_JOINED]) => {
      this.eventEmitter.emit('group_member_joined', data);
    });

    this.socket.on(SocketEvent.GROUP_MEMBER_LEFT, (data: EventPayloads[SocketEvent.GROUP_MEMBER_LEFT]) => {
      this.eventEmitter.emit('group_member_left', data);
    });

    this.socket.on(SocketEvent.GROUP_MEMBERS, (data: EventPayloads[SocketEvent.GROUP_MEMBERS]) => {
      this.eventEmitter.emit('group_members', data);
    });

    this.socket.on(SocketEvent.USER_GROUPS, (data: EventPayloads[SocketEvent.USER_GROUPS]) => {
      this.eventEmitter.emit('user_groups', data);
    });

    // ── Group message events ──────────────────────────────────────────────────
    this.socket.on(SocketEvent.GROUP_RECEIVE_MESSAGE, (data: EventPayloads[SocketEvent.GROUP_RECEIVE_MESSAGE]) => {
      this.eventEmitter.emit('group_message', data);
    });

    this.socket.on(SocketEvent.GROUP_MESSAGE_DELIVERED, (data: EventPayloads[SocketEvent.GROUP_MESSAGE_DELIVERED]) => {
      this.eventEmitter.emit('group_message_delivered', data);
    });

    this.socket.on(SocketEvent.GROUP_MESSAGE_READ, (data: EventPayloads[SocketEvent.GROUP_MESSAGE_READ]) => {
      this.eventEmitter.emit('group_message_read', data);
    });

    this.socket.on(SocketEvent.GROUP_MESSAGE_ERROR, (data: EventPayloads[SocketEvent.GROUP_MESSAGE_ERROR]) => {
      this.eventEmitter.emit('group_message_error', data);
    });

    this.socket.on(SocketEvent.GROUP_TYPING_START, (data: EventPayloads[SocketEvent.GROUP_TYPING_START]) => {
      this.eventEmitter.emit('group_typing_start', data);
    });

    this.socket.on(SocketEvent.GROUP_TYPING_STOP, (data: EventPayloads[SocketEvent.GROUP_TYPING_STOP]) => {
      this.eventEmitter.emit('group_typing_stop', data);
    });

    this.socket.on(SocketEvent.GROUP_MESSAGE_HISTORY, (data: EventPayloads[SocketEvent.GROUP_MESSAGE_HISTORY]) => {
      this.eventEmitter.emit('group_message_history', data);
    });

    // ── Voice call events ─────────────────────────────────────────────────────
    this.socket.on(SocketEvent.CALL_ICE_SERVERS, (data: EventPayloads[SocketEvent.CALL_ICE_SERVERS]) => {
      this.eventEmitter.emit('call_ice_servers', data);
    });

    this.socket.on(SocketEvent.CALL_INCOMING, (data: EventPayloads[SocketEvent.CALL_INCOMING]) => {
      this.eventEmitter.emit('call_incoming', data);
    });

    this.socket.on(SocketEvent.CALL_RINGING, (data: EventPayloads[SocketEvent.CALL_RINGING]) => {
      this.eventEmitter.emit('call_ringing', data);
    });

    this.socket.on(SocketEvent.CALL_ANSWERED, (data: EventPayloads[SocketEvent.CALL_ANSWERED]) => {
      this.eventEmitter.emit('call_answered', data);
    });

    this.socket.on(SocketEvent.CALL_REJECTED, (data: EventPayloads[SocketEvent.CALL_REJECTED]) => {
      this.eventEmitter.emit('call_rejected', data);
    });

    this.socket.on(SocketEvent.CALL_ENDED, (data: EventPayloads[SocketEvent.CALL_ENDED]) => {
      this.eventEmitter.emit('call_ended', data);
    });

    this.socket.on(SocketEvent.CALL_BUSY, (data: EventPayloads[SocketEvent.CALL_BUSY]) => {
      this.eventEmitter.emit('call_busy', data);
    });

    this.socket.on(SocketEvent.CALL_ICE_CANDIDATE, (data: EventPayloads[SocketEvent.CALL_ICE_CANDIDATE]) => {
      this.eventEmitter.emit('call_ice_candidate', data);
    });
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  public authenticate(token: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected. Call connect() first.');
    }
    this.socket.emit(SocketEvent.AUTHENTICATE, { token } as EventPayloads[SocketEvent.AUTHENTICATE]);
  }

  // ─── 1:1 messaging ────────────────────────────────────────────────────────

  public sendMessage(to: string, content: string, metadata?: Record<string, any>): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.SEND_MESSAGE, {
      to, content, metadata,
    } as EventPayloads[SocketEvent.SEND_MESSAGE]);
  }

  public markMessageRead(messageId: string, from: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.MESSAGE_READ, { messageId, from });
  }

  public getMessageHistory(withUserId: string, opts: { limit?: number; before?: number } = {}): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GET_MESSAGE_HISTORY, {
      with: withUserId,
      limit: opts.limit ?? 50,
      before: opts.before,
    } as EventPayloads[SocketEvent.GET_MESSAGE_HISTORY]);
  }

  public startTyping(to: string): void {
    if (!this.isAuthenticated()) return;
    this.socket!.emit(SocketEvent.TYPING_START, { to });
  }

  public stopTyping(to: string): void {
    if (!this.isAuthenticated()) return;
    this.socket!.emit(SocketEvent.TYPING_STOP, { to });
  }

  // ─── Presence ──────────────────────────────────────────────────────────────

  public getOnlineStatus(userIds: string[]): void {
    this.assertConnected();
    this.socket!.emit(SocketEvent.GET_ONLINE_STATUS, { userIds } as EventPayloads[SocketEvent.GET_ONLINE_STATUS]);
  }

  // ─── Group management ─────────────────────────────────────────────────────

  public createGroup(name: string, members: string[] = [], metadata?: Record<string, any>): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GROUP_CREATE, {
      name, members, metadata,
    } as EventPayloads[SocketEvent.GROUP_CREATE]);
  }

  public joinGroup(groupId: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GROUP_JOIN, { groupId } as EventPayloads[SocketEvent.GROUP_JOIN]);
  }

  public leaveGroup(groupId: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GROUP_LEAVE, { groupId } as EventPayloads[SocketEvent.GROUP_LEAVE]);
  }

  public getGroupMembers(groupId: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GET_GROUP_MEMBERS, { groupId } as EventPayloads[SocketEvent.GET_GROUP_MEMBERS]);
  }

  public getUserGroups(): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GET_USER_GROUPS, {});
  }

  // ─── Group messaging ──────────────────────────────────────────────────────

  public sendGroupMessage(groupId: string, content: string, metadata?: Record<string, any>): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GROUP_SEND_MESSAGE, {
      groupId, content, metadata,
    } as EventPayloads[SocketEvent.GROUP_SEND_MESSAGE]);
  }

  public markGroupMessageRead(groupId: string, messageId: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GROUP_MESSAGE_READ, {
      groupId, messageId,
    } as EventPayloads[SocketEvent.GROUP_MESSAGE_READ]);
  }

  public getGroupMessageHistory(groupId: string, opts: { limit?: number; before?: number } = {}): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.GET_GROUP_MESSAGE_HISTORY, {
      groupId,
      limit: opts.limit ?? 50,
      before: opts.before,
    } as EventPayloads[SocketEvent.GET_GROUP_MESSAGE_HISTORY]);
  }

  public startGroupTyping(groupId: string): void {
    if (!this.isAuthenticated()) return;
    this.socket!.emit(SocketEvent.GROUP_TYPING_START, { groupId });
  }

  public stopGroupTyping(groupId: string): void {
    if (!this.isAuthenticated()) return;
    this.socket!.emit(SocketEvent.GROUP_TYPING_STOP, { groupId });
  }

  // ─── Voice calling ─────────────────────────────────────────────────────────

  public getIceServers(): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.CALL_GET_ICE_SERVERS, {});
  }

  public initiateCall(to: string, sdpOffer: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.CALL_INITIATE, { to, sdpOffer } as EventPayloads[SocketEvent.CALL_INITIATE]);
  }

  public answerCall(callId: string, sdpAnswer: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.CALL_ANSWER, { callId, sdpAnswer } as EventPayloads[SocketEvent.CALL_ANSWER]);
  }

  public rejectCall(callId: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.CALL_REJECT, { callId } as EventPayloads[SocketEvent.CALL_REJECT]);
  }

  public hangUp(callId: string): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.CALL_HANGUP, { callId } as EventPayloads[SocketEvent.CALL_HANGUP]);
  }

  public sendIceCandidate(callId: string, candidate: EventPayloads[typeof SocketEvent.CALL_ICE_CANDIDATE]['candidate']): void {
    this.assertAuthenticated();
    this.socket!.emit(SocketEvent.CALL_ICE_CANDIDATE, { callId, candidate } as EventPayloads[SocketEvent.CALL_ICE_CANDIDATE]);
  }

  // ─── Event subscriptions ──────────────────────────────────────────────────

  public on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventEmitter.on(event, handler);
  }

  public off(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  // ─── State ─────────────────────────────────────────────────────────────────

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

  public onStateChange(listener: (state: ConnectionState) => void): () => void {
    return this.connectionManager.onStateChange(listener);
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.isConnected()) {
      throw new Error('[Sockr] Not connected. Call connect() first.');
    }
  }

  private assertAuthenticated(): void {
    if (!this.isAuthenticated()) {
      throw new Error('[Sockr] Not authenticated. Call authenticate() first.');
    }
  }

  private shouldReconnect(reason: string): boolean {
    return reason !== 'io client disconnect' && this.connectionManager.canReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const attempt = this.connectionManager.incrementReconnectAttempts();
    const delay = this.config.reconnectionDelay! * attempt;

    this.connectionManager.setState(ConnectionState.RECONNECTING);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}