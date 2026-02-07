import { Socket } from "socket.io";
import { Plugin } from "./Plugin";
import { SocketEvent, EventPayloads, User } from "sockr-shared";

export type AuthHandler = (token: string) => Promise<User | null>;

export class AuthPlugin extends Plugin {
  private authHandler: AuthHandler;

  constructor(io: any, connectionManager: any, authHandler: AuthHandler) {
    super(io, connectionManager);
    this.authHandler = authHandler;
  }

  public initialize(): void {
    // No global initialization needed for auth
  }

  public handleConnection(socket: Socket): void {
    socket.on(
      SocketEvent.AUTHENTICATE,
      async (payload: EventPayloads[SocketEvent.AUTHENTICATE]) => {
        try {
          const user = await this.authHandler(payload.token);

          if (!user) {
            socket.emit(SocketEvent.AUTH_ERROR, {
              message: "Invalid authentication token",
            } as EventPayloads[SocketEvent.AUTH_ERROR]);
            socket.disconnect();
            return;
          }

          user.socketId = socket.id;
          user.connectedAt = Date.now();

          this.connectionManager.authenticateConnection(socket.id, user);

          socket.emit(SocketEvent.AUTHENTICATED, {
            userId: user.id,
            socketId: socket.id,
          } as EventPayloads[SocketEvent.AUTHENTICATED]);
        } catch (error) {
          socket.emit(SocketEvent.AUTH_ERROR, {
            message: "Authentication failed",
          } as EventPayloads[SocketEvent.AUTH_ERROR]);
          socket.disconnect();
        }
      }
    );
  }
}