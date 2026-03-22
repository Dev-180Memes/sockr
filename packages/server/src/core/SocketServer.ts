import { Server, ServerOptions } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import { Server as HTTPSServer } from 'https';
import { ConnectionManager } from './ConnectionManager';
import { Connection } from './Connection';
import { AuthPlugin, AuthHandler } from '../plugins/AuthPlugin';
import { PresencePlugin } from '../plugins/PresencePlugin';
import { MessagePlugin } from '../plugins/MessagePlugin';
import { GroupPlugin } from '../plugins/GroupPlugin';
import { Plugin } from '../plugins/Plugin';
import { ServerConfig } from 'sockr-shared';
import {
  resolveProviders,
  connectProviders,
  disconnectProviders,
  ResolvedProviders,
} from '../providers';

type HTTPOrHTTPSServer = HTTPServer | HTTPSServer;

export class SocketServer {
  private io: Server | null = null;
  private httpServer: HTTPServer | null = null;
  private connectionManager: ConnectionManager;
  private plugins: Plugin[] = [];
  private authPlugin?: AuthPlugin;
  private presencePlugin?: PresencePlugin;
  private messagePlugin?: MessagePlugin;
  private groupPlugin?: GroupPlugin;
  private config: ServerConfig;
  private providers: ResolvedProviders;
  private isOwnServer: boolean = false;

  constructor(config: ServerConfig = {}) {
    this.config = {
      cors: { origin: '*', credentials: true },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      ...config,
    };

    this.connectionManager = new ConnectionManager();
    this.providers = resolveProviders(config.providers);
  }

  // ─── Server setup ──────────────────────────────────────────────────────────

  public attach(httpServer: HTTPOrHTTPSServer): this {
    if (this.io) throw new Error('Socket.IO server already initialized');
    this.httpServer = httpServer as HTTPServer;
    this.isOwnServer = false;
    this.initializeSocketIO(httpServer);
    return this;
  }

  public attachToExpress(app: any): this {
    const httpServer = createServer(app);
    this.isOwnServer = true;
    return this.attach(httpServer);
  }

  public createStandalone(): this {
    if (this.io) throw new Error('Socket.IO server already initialized');
    this.httpServer = createServer();
    this.isOwnServer = true;
    this.initializeSocketIO(this.httpServer);
    return this;
  }

  private initializeSocketIO(httpServer: HTTPOrHTTPSServer): void {
    const socketOptions: Partial<ServerOptions> = {
      cors: this.config.cors,
      pingTimeout: this.config.pingTimeout,
      pingInterval: this.config.pingInterval,
      transports: this.config.transports,
    };

    this.io = new Server(httpServer, socketOptions);
    this.setupConnectionHandler();
  }

  // ─── Plugin registration ───────────────────────────────────────────────────

  public useAuth(authHandler: AuthHandler): this {
    this.authPlugin = new AuthPlugin(this.getIO(), this.connectionManager, authHandler);
    this.plugins.push(this.authPlugin);
    return this;
  }

  public usePresence(): this {
    this.presencePlugin = new PresencePlugin(this.getIO(), this.connectionManager);
    this.plugins.push(this.presencePlugin);
    return this;
  }

  public useMessaging(): this {
    this.messagePlugin = new MessagePlugin(
      this.getIO(),
      this.connectionManager,
      this.providers
    );
    this.plugins.push(this.messagePlugin);
    return this;
  }

  public useGroupMessaging(): this {
    this.groupPlugin = new GroupPlugin(
      this.getIO(),
      this.connectionManager,
      this.providers
    );
    this.plugins.push(this.groupPlugin);
    return this;
  }

  public use(plugin: Plugin): this {
    this.plugins.push(plugin);
    return this;
  }

  // ─── Connection handler ────────────────────────────────────────────────────

  private setupConnectionHandler(): void {
    const io = this.getIO();

    io.on('connection', (socket) => {
      const connection = new Connection(socket);
      this.connectionManager.addConnection(connection);

      console.log(`[Sockr] New connection: ${socket.id}`);

      // Initialise all plugins for this socket
      this.plugins.forEach((plugin) => plugin.handleConnection(socket));

      // After successful authentication:
      // 1. Broadcast user online
      // 2. Flush queued 1:1 messages
      // 3. Restore group room memberships + flush group queue
      socket.on('authenticated', async () => {
        const userId = connection.getUserId();
        if (!userId) return;

        if (this.presencePlugin) {
          this.presencePlugin.broadcastUserOnline(userId);
        }

        if (this.messagePlugin) {
          await this.messagePlugin.flushQueuedMessages(userId, socket.id);
        }

        if (this.groupPlugin) {
          await this.groupPlugin.restoreGroupMemberships(userId, socket.id);
        }
      });

      socket.on('disconnect', () => {
        const userId = connection.getUserId();
        console.log(
          `[Sockr] Disconnected: ${socket.id}${userId ? ` (${userId})` : ''}`
        );

        this.connectionManager.removeConnection(socket.id);

        // Only broadcast offline if this was the user's last active socket
        if (userId && !this.connectionManager.isUserOnline(userId)) {
          if (this.presencePlugin) {
            this.presencePlugin.broadcastUserOffline(userId);
          }
        }
      });
    });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  public async listen(port?: number): Promise<void> {
    if (!this.io) this.createStandalone();

    // Connect all providers (no-op for in-memory, opens connections for DB/Redis)
    await connectProviders(this.providers);

    this.plugins.forEach((plugin) => plugin.initialize());

    if (!this.isOwnServer) {
      console.warn(
        '[Sockr] Attached to existing HTTP server. ' +
        'Call listen() on your HTTP server instead of sockr.listen().'
      );
      return;
    }

    if (!this.httpServer) throw new Error('HTTP server not initialized');

    const listenPort = port || this.config.port || 3000;

    return new Promise((resolve) => {
      this.httpServer!.listen(listenPort, () => {
        console.log(`[Sockr] WebSocket server listening on port ${listenPort}`);
        resolve();
      });
    });
  }

  public async initialize(): Promise<this> {
    if (!this.io) {
      throw new Error(
        'Socket.IO not initialized. Call attach() or createStandalone() first.'
      );
    }

    await connectProviders(this.providers);
    this.plugins.forEach((plugin) => plugin.initialize());
    return this;
  }

  public async close(): Promise<void> {
    await disconnectProviders(this.providers);

    return new Promise((resolve) => {
      if (this.io) {
        this.io.close(() => {
          if (this.httpServer && this.isOwnServer) {
            this.httpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  public getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  public getProviders(): ResolvedProviders {
    return this.providers;
  }

  public getIO(): Server {
    if (!this.io) throw new Error('Socket.IO server not initialized');
    return this.io;
  }
}