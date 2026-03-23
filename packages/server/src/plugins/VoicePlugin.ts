import { createHmac } from 'crypto';
import { randomUUID } from 'crypto';
import { Socket } from 'socket.io';
import { Plugin } from './Plugin';
import {
  SocketEvent,
  EventPayloads,
  VoiceConfig,
  ActiveCall,
  IceServer,
} from 'sockr-shared';

export class VoicePlugin extends Plugin {
  private config: VoiceConfig;
  private activeCalls: Map<string, ActiveCall> = new Map();

  constructor(io: any, connectionManager: any, config: VoiceConfig = {}) {
    super(io, connectionManager);
    this.config = config;
  }

  public initialize(): void {}

  // ─── ICE server generation ─────────────────────────────────────────────────

  /**
   * Builds an ICE server list for a given user.
   * Static servers are always included. If a TURN config is present,
   * short-lived HMAC-SHA1 credentials are generated on the fly so the
   * TURN secret never reaches the client.
   */
  public generateIceServers(userId: string): IceServer[] {
    const servers: IceServer[] = [...(this.config.iceServers ?? [])];

    if (this.config.turn) {
      const { urls, secret, ttl = 3600 } = this.config.turn;
      const expiry = Math.floor(Date.now() / 1000) + ttl;
      const username = `${expiry}:${userId}`;
      const credential = createHmac('sha1', secret)
        .update(username)
        .digest('base64');

      const turnUrls = Array.isArray(urls) ? urls : [urls];
      for (const url of turnUrls) {
        servers.push({ urls: url, username, credential });
      }
    }

    return servers;
  }

  // ─── Connection handler ────────────────────────────────────────────────────

  public handleConnection(socket: Socket): void {
    // ── CALL_GET_ICE_SERVERS ────────────────────────────────────────────────
    socket.on(SocketEvent.CALL_GET_ICE_SERVERS, () => {
      const connection = this.connectionManager.getConnection(socket.id);
      if (!connection || !connection.isAuth()) return;

      const userId = connection.getUserId()!;
      socket.emit(SocketEvent.CALL_ICE_SERVERS, {
        iceServers: this.generateIceServers(userId),
      } as EventPayloads[SocketEvent.CALL_ICE_SERVERS]);
    });

    // ── CALL_INITIATE ───────────────────────────────────────────────────────
    socket.on(
      SocketEvent.CALL_INITIATE,
      (payload: EventPayloads[SocketEvent.CALL_INITIATE]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const callerId = connection.getUserId()!;
        const calleeConns = this.connectionManager.getConnectionsByUserId(payload.to);

        if (calleeConns.length === 0) {
          // Callee is offline — end immediately with an empty callId
          socket.emit(SocketEvent.CALL_ENDED, { callId: '' } as EventPayloads[SocketEvent.CALL_ENDED]);
          return;
        }

        // Check if callee is already in an active or ringing call
        const calleeIsBusy = [...this.activeCalls.values()].some(
          (c) =>
            (c.callerId === payload.to || c.calleeId === payload.to) &&
            (c.status === 'active' || c.status === 'ringing')
        );

        const callId = randomUUID();

        if (calleeIsBusy) {
          socket.emit(SocketEvent.CALL_BUSY, { callId } as EventPayloads[SocketEvent.CALL_BUSY]);
          return;
        }

        const call: ActiveCall = {
          callId,
          callerId,
          calleeId: payload.to,
          status: 'ringing',
          startedAt: Date.now(),
        };
        this.activeCalls.set(callId, call);

        // Notify caller — call is ringing
        socket.emit(SocketEvent.CALL_RINGING, {
          callId,
        } as EventPayloads[SocketEvent.CALL_RINGING]);

        // Deliver incoming call to all callee devices with fresh ICE servers
        const calleeIceServers = this.generateIceServers(payload.to);
        for (const conn of calleeConns) {
          conn.getSocket().emit(SocketEvent.CALL_INCOMING, {
            callId,
            from: callerId,
            sdpOffer: payload.sdpOffer,
            iceServers: calleeIceServers,
          } as EventPayloads[SocketEvent.CALL_INCOMING]);
        }
      }
    );

    // ── CALL_ANSWER ─────────────────────────────────────────────────────────
    socket.on(
      SocketEvent.CALL_ANSWER,
      (payload: EventPayloads[SocketEvent.CALL_ANSWER]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const call = this.activeCalls.get(payload.callId);
        if (!call) return;

        call.status = 'active';

        const callerConns = this.connectionManager.getConnectionsByUserId(call.callerId);
        for (const conn of callerConns) {
          conn.getSocket().emit(SocketEvent.CALL_ANSWERED, {
            callId: payload.callId,
            sdpAnswer: payload.sdpAnswer,
          } as EventPayloads[SocketEvent.CALL_ANSWERED]);
        }
      }
    );

    // ── CALL_REJECT ─────────────────────────────────────────────────────────
    socket.on(
      SocketEvent.CALL_REJECT,
      (payload: EventPayloads[SocketEvent.CALL_REJECT]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const call = this.activeCalls.get(payload.callId);
        if (!call) return;

        this.activeCalls.delete(payload.callId);

        const callerConns = this.connectionManager.getConnectionsByUserId(call.callerId);
        for (const conn of callerConns) {
          conn.getSocket().emit(SocketEvent.CALL_REJECTED, {
            callId: payload.callId,
          } as EventPayloads[SocketEvent.CALL_REJECTED]);
        }
      }
    );

    // ── CALL_HANGUP ─────────────────────────────────────────────────────────
    socket.on(
      SocketEvent.CALL_HANGUP,
      (payload: EventPayloads[SocketEvent.CALL_HANGUP]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        const call = this.activeCalls.get(payload.callId);
        if (!call) return;

        this.activeCalls.delete(payload.callId);

        const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
        const otherConns = this.connectionManager.getConnectionsByUserId(otherUserId);
        for (const conn of otherConns) {
          conn.getSocket().emit(SocketEvent.CALL_ENDED, {
            callId: payload.callId,
          } as EventPayloads[SocketEvent.CALL_ENDED]);
        }
      }
    );

    // ── CALL_ICE_CANDIDATE ──────────────────────────────────────────────────
    socket.on(
      SocketEvent.CALL_ICE_CANDIDATE,
      (payload: EventPayloads[SocketEvent.CALL_ICE_CANDIDATE]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        const call = this.activeCalls.get(payload.callId);
        if (!call) return;

        const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
        const otherConns = this.connectionManager.getConnectionsByUserId(otherUserId);
        for (const conn of otherConns) {
          conn.getSocket().emit(SocketEvent.CALL_ICE_CANDIDATE, payload);
        }
      }
    );
  }

  // ─── Disconnect cleanup ────────────────────────────────────────────────────

  /**
   * Called by SocketServer after the user's last socket disconnects.
   * Ends any active or ringing calls they were part of.
   */
  public cleanupCallsForUser(userId: string): void {
    for (const [callId, call] of this.activeCalls) {
      if (call.callerId !== userId && call.calleeId !== userId) continue;

      this.activeCalls.delete(callId);

      const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
      const otherConns = this.connectionManager.getConnectionsByUserId(otherUserId);
      for (const conn of otherConns) {
        conn.getSocket().emit(SocketEvent.CALL_ENDED, { callId } as EventPayloads[SocketEvent.CALL_ENDED]);
      }
    }
  }
}
