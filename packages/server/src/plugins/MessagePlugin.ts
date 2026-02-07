import { Socket } from "socket.io";
import { Plugin } from "./Plugin";
import { SocketEvent, EventPayloads } from "sockr-shared";
import { randomUUID } from "crypto";

export class MessagePlugin extends Plugin {
  public initialize(): void {
    // No global initialization needed for messages
  }

  public handleConnection(socket: Socket): void {
    socket.on(
      SocketEvent.SEND_MESSAGE,
      (payload: EventPayloads[SocketEvent.SEND_MESSAGE]) => {
        const connection = this.connectionManager.getConnection(socket.id);

        if (!connection || !connection.isAuth()) {
          socket.emit(SocketEvent.MESSAGE_ERROR, {
            error: 'Not authenticated',
          } as EventPayloads[SocketEvent.MESSAGE_ERROR]);
          return;
        }

        const fromUserId = connection.getUserId()!;
        if (!fromUserId) {
          socket.emit(SocketEvent.MESSAGE_ERROR, {
            error: 'Invalid user',
          } as EventPayloads[SocketEvent.MESSAGE_ERROR]);
          return;
        }

        const recipientConnection = this.connectionManager.getConnectionByUserId(
          payload.to
        );

        const messageId = randomUUID();

        if (!recipientConnection) {
          socket.emit(SocketEvent.MESSAGE_ERROR, {
            messageId,
            error: 'Recipient is offline',
          } as EventPayloads[SocketEvent.MESSAGE_ERROR]);
          return;
        }

        recipientConnection.emit(SocketEvent.RECEIVE_MESSAGE, {
          from: fromUserId,
          content: payload.content,
          timestamp: Date.now(),
          messageId,
          metadata: payload.metadata,
        } as EventPayloads[SocketEvent.RECEIVE_MESSAGE]);

        socket.emit(SocketEvent.MESSAGE_DELIVERED, {
          messageId,
        } as EventPayloads[SocketEvent.MESSAGE_DELIVERED]);
      }
    );

    socket.on(SocketEvent.TYPING_START, (payload: { to: string }) => {
      const connection = this.connectionManager.getConnection(socket.id);
      if (!connection || !connection.isAuth()) return;

      const fromUserId = connection.getUserId()!;
      if (!fromUserId) return;

      const recipientConnection = this.connectionManager.getConnectionByUserId(
        payload.to
      );

      if (recipientConnection) {
        recipientConnection.emit(SocketEvent.TYPING_START, {
          from: fromUserId,
        } as EventPayloads[SocketEvent.TYPING_START]);
      }
    });

    socket.on(SocketEvent.TYPING_STOP, (payload: { to: string }) => {
      const connection = this.connectionManager.getConnection(socket.id);
      if (!connection || !connection.isAuth()) return;

      const fromUserId = connection.getUserId()!;
      if (!fromUserId) return;

      const recipientConnection = this.connectionManager.getConnectionByUserId(
        payload.to
      );

      if (recipientConnection) {
        recipientConnection.emit(SocketEvent.TYPING_STOP, {
          from: fromUserId,
        } as EventPayloads[SocketEvent.TYPING_STOP]);
      }
    });
  }
}