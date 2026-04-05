import { Socket } from 'socket.io';
import { Plugin } from './Plugin';
import {
  SocketEvent,
  EventPayloads,
  ISFUProvider,
} from 'sockr-shared';
import type { ResolvedProviders } from '../providers';

export class ConferencePlugin extends Plugin {
  private sfuProvider: ISFUProvider;
  private sfuUrl: string;
  private providers: ResolvedProviders;

  /**
   * Active conference rooms.
   * Key: groupId
   * Value: Set of userIds currently in the call
   */
  private rooms: Map<string, Set<string>> = new Map();

  /**
   * Guards against race conditions when two users simultaneously trigger
   * room creation for the same groupId.
   */
  private roomsBeingCreated: Set<string> = new Set();

  constructor(
    io: any,
    connectionManager: any,
    sfuProvider: ISFUProvider,
    sfuUrl: string,
    providers: ResolvedProviders
  ) {
    super(io, connectionManager);
    this.sfuProvider = sfuProvider;
    this.sfuUrl = sfuUrl;
    this.providers = providers;
  }

  public initialize(): void {}

  // ─── Connection handler ────────────────────────────────────────────────────

  public handleConnection(socket: Socket): void {
    // ── CONFERENCE_JOIN ───────────────────────────────────────────────────────
    socket.on(
      SocketEvent.CONFERENCE_JOIN,
      async (payload: EventPayloads[SocketEvent.CONFERENCE_JOIN]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) {
          socket.emit(SocketEvent.CONFERENCE_ERROR, {
            groupId: payload.groupId,
            error: 'Not authenticated',
          } as EventPayloads[SocketEvent.CONFERENCE_ERROR]);
          return;
        }

        const userId = connection.getUserId()!;
        const { groupId } = payload;

        // Verify the user is a member of the group
        let isMember = false;
        try {
          isMember = await this.providers.cache.sismember(
            `group:${groupId}:members`,
            userId
          );
        } catch (err) {
          console.error('[Sockr] ConferencePlugin: cache membership check failed', err);
          socket.emit(SocketEvent.CONFERENCE_ERROR, {
            groupId,
            error: 'Failed to verify group membership',
          } as EventPayloads[SocketEvent.CONFERENCE_ERROR]);
          return;
        }

        if (!isMember) {
          socket.emit(SocketEvent.CONFERENCE_ERROR, {
            groupId,
            error: 'Not a member of this group',
          } as EventPayloads[SocketEvent.CONFERENCE_ERROR]);
          return;
        }

        // Ensure room set exists
        if (!this.rooms.has(groupId)) {
          this.rooms.set(groupId, new Set());
        }
        const room = this.rooms.get(groupId)!;
        const isFirstParticipant = room.size === 0;
        const isNewParticipant = !room.has(userId);

        // Create the room on the SFU if this is the first participant
        if (isFirstParticipant && !this.roomsBeingCreated.has(groupId)) {
          this.roomsBeingCreated.add(groupId);
          try {
            await this.sfuProvider.createRoom?.(groupId);
          } catch (err) {
            console.error('[Sockr] ConferencePlugin: failed to create SFU room', err);
            this.roomsBeingCreated.delete(groupId);
            socket.emit(SocketEvent.CONFERENCE_ERROR, {
              groupId,
              error: 'Failed to create conference room',
            } as EventPayloads[SocketEvent.CONFERENCE_ERROR]);
            return;
          }
          this.roomsBeingCreated.delete(groupId);
        }

        // Generate a short-lived SFU token for this participant
        let token: string;
        try {
          token = await this.sfuProvider.generateToken(groupId, userId);
        } catch (err) {
          console.error('[Sockr] ConferencePlugin: failed to generate SFU token', err);
          socket.emit(SocketEvent.CONFERENCE_ERROR, {
            groupId,
            error: 'Failed to generate access token',
          } as EventPayloads[SocketEvent.CONFERENCE_ERROR]);
          return;
        }

        // Add to room tracking (deduplicated by userId)
        room.add(userId);

        // Deliver token exclusively to the requesting socket
        socket.emit(SocketEvent.CONFERENCE_TOKEN, {
          groupId,
          sfuUrl: this.sfuUrl,
          token,
        } as EventPayloads[SocketEvent.CONFERENCE_TOKEN]);

        // Broadcast to the group room
        if (isFirstParticipant) {
          this.io.to(groupId).emit(SocketEvent.CONFERENCE_STARTED, {
            groupId,
            startedBy: userId,
            participantCount: room.size,
          } as EventPayloads[SocketEvent.CONFERENCE_STARTED]);
        } else if (isNewParticipant) {
          this.io.to(groupId).emit(SocketEvent.CONFERENCE_PARTICIPANT_JOINED, {
            groupId,
            userId,
            participantCount: room.size,
          } as EventPayloads[SocketEvent.CONFERENCE_PARTICIPANT_JOINED]);
        }
      }
    );

    // ── CONFERENCE_LEAVE ──────────────────────────────────────────────────────
    socket.on(
      SocketEvent.CONFERENCE_LEAVE,
      async (payload: EventPayloads[SocketEvent.CONFERENCE_LEAVE]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        await this.handleParticipantLeft(userId, payload.groupId);
      }
    );
  }

  // ─── Disconnect cleanup ────────────────────────────────────────────────────

  /**
   * Called by SocketServer after the user's last socket disconnects.
   * Ends any conference calls they were part of.
   */
  public async cleanupParticipant(userId: string): Promise<void> {
    for (const groupId of this.rooms.keys()) {
      const room = this.rooms.get(groupId)!;
      if (room.has(userId)) {
        await this.handleParticipantLeft(userId, groupId);
      }
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private async handleParticipantLeft(userId: string, groupId: string): Promise<void> {
    const room = this.rooms.get(groupId);
    if (!room || !room.has(userId)) return;

    // Only remove and broadcast if this is the user's last socket
    const userConns = this.connectionManager.getConnectionsByUserId(userId);
    const userStillConnected = userConns.length > 1;
    if (userStillConnected) return; // another device is still in the call

    room.delete(userId);

    if (room.size === 0) {
      // Last participant — end the call
      this.rooms.delete(groupId);
      try {
        await this.sfuProvider.deleteRoom?.(groupId);
      } catch (err) {
        // Log but don't throw — SFU's emptyTimeout will clean up
        console.error('[Sockr] ConferencePlugin: failed to delete SFU room', err);
      }
      this.io.to(groupId).emit(SocketEvent.CONFERENCE_ENDED, {
        groupId,
      } as EventPayloads[SocketEvent.CONFERENCE_ENDED]);
    } else {
      this.io.to(groupId).emit(SocketEvent.CONFERENCE_PARTICIPANT_LEFT, {
        groupId,
        userId,
        participantCount: room.size,
      } as EventPayloads[SocketEvent.CONFERENCE_PARTICIPANT_LEFT]);
    }
  }
}
