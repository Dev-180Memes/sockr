import { Server, ServerOptions } from "socket.io";
import { createServer, Server as HTTPServer } from "http";
import { ConnectionManager } from "./ConnectionManager";
import { Connection } from "./Connection";
import { AuthPlugin, AuthHandler } from "../plugins/AuthPlugin";
import { PresencePlugin } from "../plugins/PresencePlugin";
import { MessagePlugin } from "../plugins/MessagePlugin";
import { Plugin } from "../plugins/Plugin";
import { ServerConfig } from "sockr-shared";
import { resolve } from "dns";

export class SockerServer {
  private io: Server;
  private httpServer: HTTPServer;
  private connectionManager: ConnectionManager;
  private plugins: Plugin[] = [];
  private authPlugin?: AuthPlugin;
  private presencePlugin?: PresencePlugin;
  private messagePlugin?: MessagePlugin;

  constructor(config: ServerConfig = {}) {
    this.httpServer = createServer();
    this.connectionManager = new ConnectionManager();

    const socketOptions: Partial<ServerOptions> = {
      cors: config.cors || {
        origin: "*",
        credentials: true,
      },
      pingTimeout: config.pingTimeout || 60000,
      pingInterval: config.pingInterval || 25000,
      transports: config.transports || ["websocket", "polling"],
    };

    this.io = new Server(this.httpServer, socketOptions);
    this.setupConnectionHandler();
  }

  public useAuth(authHandler: AuthHandler): this {
    this.authPlugin = new AuthPlugin(this.io, this.connectionManager, authHandler);
    this.plugins.push(this.authPlugin);
    return this;
  }

  public usePresence(): this {
    this.presencePlugin = new PresencePlugin(this.io, this.connectionManager);
    this.plugins.push(this.presencePlugin);
    return this;
  }

  public useMessaging(): this {
    this.messagePlugin = new MessagePlugin(this.io, this.connectionManager);
    this.plugins.push(this.messagePlugin);
    return this;
  }

  public use(plugin: Plugin): this {
    this.plugins.push(plugin);
    return this;
  }

  private setupConnectionHandler(): void {
    this.io.on('connection', (socket) => {
      const connection = new Connection(socket);
      this.connectionManager.addConnection(connection);

      console.log(`New connection: ${socket.id}`);

      this.plugins.forEach((plugin) => {
        plugin.handleConnection(socket);
      });

      socket.on('disconnect', () => {
        const userId = connection.getUserId();
        console.log(`Disconnected ${socket.id}${userId ? ` (User: ${userId})` : ''}`);

        this.connectionManager.removeConnection(socket.id);

        if (userId && this.presencePlugin) {
          this.presencePlugin.broadcastUserOffline(userId);
        }
      });

      socket.on('authenticated', () => {
        const userId = connection.getUserId();
        if (userId && this.presencePlugin) {
          this.presencePlugin.broadcastUserOnline(userId);
        }
      });
    });
  }

  public listen(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.plugins.forEach((plugin) => {
        plugin.initialize();
      });

      this.httpServer.listen(port, () => {
        console.log(`Socket server listening on port ${port}`);
        resolve();
      });
    });
  }

  public getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  public getIO(): Server {
    return this.io;
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }
}