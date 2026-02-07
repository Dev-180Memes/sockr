import { Socket } from "socket.io";
import { Plugin } from "./Plugin";
import { SocketEvent, EventPayloads } from "sockr-shared";

export class PresencePlugin extends Plugin {
  public initialize(): void {
    // No global initialization needed for presence
  }

  public handleConnection(socket: Socket): void {
    socket.on(
      SocketEvent.GET_ONLINE_STATUS,
      (payload: EventPayloads[SocketEvent.GET_ONLINE_STATUS]) => {
        const statuses = this.connectionManager.getUsersOnlineStatus(
          payload.userIds
        );

        socket.emit(SocketEvent.ONLINE_STATUS, {
          statuses,
        } as EventPayloads[SocketEvent.ONLINE_STATUS]);
      }
    );
  }

  public broadcastUserOnline(userId: string): void {
    this.io.emit(SocketEvent.USER_ONLINE, {
      userId,
    } as EventPayloads[SocketEvent.USER_ONLINE]);
  }

  public broadcastUserOffline(userId: string): void {
    this.io.emit(SocketEvent.USER_OFFLINE, {
      userId,
    } as EventPayloads[SocketEvent.USER_OFFLINE]);
  }
}