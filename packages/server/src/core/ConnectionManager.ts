import { Connection } from "./Connection";
import { User, UserConnection } from "sockr-shared";

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private userSockets: Map<string, string> = new Map();

  public addConnection(connection: Connection): void {
    this.connections.set(connection.getSocketId(), connection);
  }

  public removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      const userId = connection.getUserId();
      if (userId) {
        this.userSockets.delete(userId);
      }
      this.connections.delete(socketId);
    }
  }

  public getConnection(socketId: string): Connection | undefined {
    return this.connections.get(socketId);
  }

  public getConnectionByUserId(userId: string): Connection | undefined {
    const socketId = this.userSockets.get(userId);
    if (!socketId) return undefined;
    return this.connections.get(socketId);
  }

  public authenticateConnection(socketId: string, user: User): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.authenticate(user);
      this.userSockets.set(user.id, socketId);
    }
  }

  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
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