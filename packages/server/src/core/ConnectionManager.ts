import { Connection } from './Connection';
import { User, UserConnection } from 'sockr-shared';

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  // userId → Set of socketIds (supports multiple tabs / devices)
  private userSockets: Map<string, Set<string>> = new Map();

  public addConnection(connection: Connection): void {
    this.connections.set(connection.getSocketId(), connection);
  }

  public removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      const userId = connection.getUserId();
      if (userId) {
        const sockets = this.userSockets.get(userId);
        if (sockets) {
          sockets.delete(socketId);
          if (sockets.size === 0) {
            this.userSockets.delete(userId);
          }
        }
      }
      this.connections.delete(socketId);
    }
  }

  public getConnection(socketId: string): Connection | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Returns the first active connection for a user.
   * For targeted 1:1 delivery when any socket will do.
   */
  public getConnectionByUserId(userId: string): Connection | undefined {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return undefined;
    const socketId = sockets.values().next().value;
    return this.connections.get(socketId || "");
  }

  /**
   * Returns ALL active connections for a user.
   * Used to deliver messages to every open tab/device.
   */
  public getConnectionsByUserId(userId: string): Connection[] {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return [];
    return Array.from(sockets)
      .map((id) => this.connections.get(id))
      .filter((c): c is Connection => c !== undefined);
  }

  public authenticateConnection(socketId: string, user: User): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.authenticate(user);
      const sockets = this.userSockets.get(user.id) || new Set<string>();
      sockets.add(socketId);
      this.userSockets.set(user.id, sockets);
    }
  }

  public isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  public getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  public getUsersOnlineStatus(userIds: string[]): Record<string, boolean> {
    const statuses: Record<string, boolean> = {};
    userIds.forEach((userId) => {
      statuses[userId] = this.isUserOnline(userId);
    });
    return statuses;
  }

  public getTotalConnections(): number {
    return this.connections.size;
  }
}