import { Socket } from 'socket.io';
import { Plugin } from './Plugin';
import { SocketEvent, EventPayloads, PersistedMessage } from 'sockr-shared';
import { randomUUID } from 'crypto';
import type { ResolvedProviders } from '../providers';

export class MessagePlugin extends Plugin {
  private providers: ResolvedProviders;

  constructor(io: any, connectionManager: any, providers: ResolvedProviders) {
    super(io, connectionManager);
    this.providers = providers;
  }

  public initialize(): void {
    // No global initialization needed
  }

  public handleConnection(socket: Socket): void {
    socket.on(
      SocketEvent.SEND_MESSAGE,
      async (payload: EventPayloads[SocketEvent.SEND_MESSAGE]) => {
        const connection = this.connectionManager.getConnection(socket.id);

        if (!connection || !connection.isAuth()) {
          socket.emit(SocketEvent.MESSAGE_ERROR, {
            error: 'Not authenticated',
          } as EventPayloads[SocketEvent.MESSAGE_ERROR]);
          return;
        }

        const fromUserId = connection.getUserId()!;
        const messageId = randomUUID();
        const timestamp = Date.now();

        // Build a deterministic conversationId — always sorted so
        // both sides of the conversation query the same key
        const conversationId = [fromUserId, payload.to].sort().join(':');

        const persisted: PersistedMessage = {
          id: messageId,
          conversationId,
          from: fromUserId,
          to: payload.to,
          content: payload.content,
          timestamp,
          metadata: payload.metadata,
          deliveredTo: [],
          readBy: [],
        };

        // Persist immediately — before attempting delivery
        try {
          await this.providers.messageStore.saveMessage(persisted);
        } catch (err) {
          console.error('[Sockr] MessagePlugin: failed to persist message', err);
          socket.emit(SocketEvent.MESSAGE_ERROR, {
            messageId,
            error: 'Failed to save message',
          } as EventPayloads[SocketEvent.MESSAGE_ERROR]);
          return;
        }

        // Attempt delivery to all recipient connections (all tabs/devices)
        const recipientConnections = this.connectionManager.getConnectionsByUserId(payload.to);

        if (recipientConnections.length > 0) {
          // Recipient is online — deliver to every active socket
          recipientConnections.forEach((conn) => {
            conn.emit(SocketEvent.RECEIVE_MESSAGE, {
              from: fromUserId,
              content: payload.content,
              timestamp,
              messageId,
              metadata: payload.metadata,
            } as EventPayloads[SocketEvent.RECEIVE_MESSAGE]);
          });

          await this.providers.messageStore.markDelivered(messageId, payload.to);
        } else {
          // Recipient is offline — add to queue, delivered on reconnect
          try {
            await this.providers.queue.enqueue(payload.to, persisted);
          } catch (err) {
            console.error('[Sockr] MessagePlugin: failed to enqueue message', err);
          }
        }

        // Acknowledge to sender
        socket.emit(SocketEvent.MESSAGE_DELIVERED, {
          messageId,
        } as EventPayloads[SocketEvent.MESSAGE_DELIVERED]);
      }
    );

    // Message read receipt
    socket.on(
      SocketEvent.MESSAGE_READ,
      async (payload: EventPayloads[SocketEvent.MESSAGE_READ]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;

        try {
          await this.providers.messageStore.markRead(payload.messageId, userId);
        } catch (err) {
          console.error('[Sockr] MessagePlugin: failed to mark read', err);
        }

        // Notify the original sender that their message was read
        if (payload.from) {
          const senderConnections = this.connectionManager.getConnectionsByUserId(payload.from);
          senderConnections.forEach((conn) => {
            conn.emit(SocketEvent.MESSAGE_READ, {
              messageId: payload.messageId,
            } as EventPayloads[SocketEvent.MESSAGE_READ]);
          });
        }
      }
    );

    // Typing indicators — unchanged from original, no persistence needed
    socket.on(SocketEvent.TYPING_START, (payload: { to: string }) => {
      const connection = this.connectionManager.getConnection(socket.id);
      if (!connection || !connection.isAuth()) return;

      const fromUserId = connection.getUserId()!;
      const recipientConnections = this.connectionManager.getConnectionsByUserId(payload.to);
      recipientConnections.forEach((conn) => {
        conn.emit(SocketEvent.TYPING_START, {
          from: fromUserId,
        } as EventPayloads[SocketEvent.TYPING_START]);
      });
    });

    socket.on(SocketEvent.TYPING_STOP, (payload: { to: string }) => {
      const connection = this.connectionManager.getConnection(socket.id);
      if (!connection || !connection.isAuth()) return;

      const fromUserId = connection.getUserId()!;
      const recipientConnections = this.connectionManager.getConnectionsByUserId(payload.to);
      recipientConnections.forEach((conn) => {
        conn.emit(SocketEvent.TYPING_STOP, {
          from: fromUserId,
        } as EventPayloads[SocketEvent.TYPING_STOP]);
      });
    });

    // Message history for a 1:1 conversation
    socket.on(
      SocketEvent.GET_MESSAGE_HISTORY,
      async (payload: EventPayloads[SocketEvent.GET_MESSAGE_HISTORY]) => {
        const connection = this.connectionManager.getConnection(socket.id);
        if (!connection || !connection.isAuth()) return;

        const userId = connection.getUserId()!;
        const conversationId = [userId, payload.with].sort().join(':');

        try {
          const messages = await this.providers.messageStore.getMessages(
            conversationId,
            { limit: payload.limit ?? 50, before: payload.before }
          );

          socket.emit(SocketEvent.MESSAGE_HISTORY, {
            conversationId,
            messages,
          } as EventPayloads[SocketEvent.MESSAGE_HISTORY]);
        } catch (err) {
          console.error('[Sockr] MessagePlugin: failed to fetch history', err);
        }
      }
    );
  }

  /**
   * Called by SocketServer when an authenticated user reconnects.
   * Flushes any queued messages that arrived while they were offline.
   */
  public async flushQueuedMessages(userId: string, socketId: string): Promise<void> {
    const connection = this.connectionManager.getConnection(socketId);
    if (!connection) return;

    try {
      const queued = await this.providers.queue.dequeue(userId);
      for (const msg of queued) {
        connection.emit(SocketEvent.RECEIVE_MESSAGE, {
          from: msg.from,
          content: msg.content,
          timestamp: msg.timestamp,
          messageId: msg.id,
          metadata: msg.metadata,
        } as EventPayloads[SocketEvent.RECEIVE_MESSAGE]);

        await this.providers.messageStore.markDelivered(msg.id, userId);
      }
    } catch (err) {
      console.error('[Sockr] MessagePlugin: failed to flush queue', err);
    }
  }
}