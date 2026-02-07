import { Server, Socket } from 'socket.io';
import { ConnectionManager } from '../core/ConnectionManager';

export abstract class Plugin {
  protected io: Server;
  protected connectionManager: ConnectionManager;

  constructor(io: Server, connectionManager: ConnectionManager) {
    this.io = io;
    this.connectionManager = connectionManager;
  }

  public abstract initialize(): void;
  public abstract handleConnection(socket: Socket): void;
}
