import { Server, ServerOptions } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import { Server as HTTPSServer } from 'https';
import { ConnectionManager } from './ConnectionManager';
import { Connection } from './Connection';
import { AuthPlugin, AuthHandler } from '../plugins/AuthPlugin';
import { PresencePlugin } from '../plugins/PresencePlugin';
import { MessagePlugin } from '../plugins/MessagePlugin';
import { Plugin } from '../plugins/Plugin';
import { ServerConfig } from 'sockr-shared';

type HTTPOrHTTPSServer = HTTPServer | HTTPSServer;

export class SocketServer {
  private io: Server | null = null;
  private httpServer: HTTPServer | null = null;
  private connectionManager: ConnectionManager;
  private plugins: Plugin[] = [];
  private authPlugin?: AuthPlugin;
  private presencePlugin?: PresencePlugin;
  private messagePlugin?: MessagePlugin;
  private config: ServerConfig;
  private isOwnServer: boolean = false; // Track if we created the HTTP server

  constructor(config: ServerConfig = {}) {
    this.config = {
      cors: {
        origin: '*',
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      ...config,
    };

    this.connectionManager = new ConnectionManager();
  }

  /**
   * Attach to an existing HTTP/HTTPS server
   * Use this when you already have an Express/Fastify/etc server
   */
  public attach(httpServer: HTTPOrHTTPSServer): this {
    if (this.io) {
      throw new Error('Socket.IO server already initialized');
    }

    this.httpServer = httpServer as HTTPServer;
    this.isOwnServer = false;
    this.initializeSocketIO(httpServer);
    return this;
  }

  /**
   * Attach to an Express app (creates HTTP server automatically)
   * Convenience method for Express users
   */
  public attachToExpress(app: any): this {
    const httpServer = createServer(app);
    this.isOwnServer = true; // We created it, but Express will manage it
    return this.attach(httpServer);
  }

  /**
   * Create a standalone server (original behavior)
   * Use this when you don't have an existing server
   */
  public createStandalone(): this {
    if (this.io) {
      throw new Error('Socket.IO server already initialized');
    }

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
    this.messagePlugin = new MessagePlugin(this.getIO(), this.connectionManager);
    this.plugins.push(this.messagePlugin);
    return this;
  }

  public use(plugin: Plugin): this {
    this.plugins.push(plugin);
    return this;
  }

  private setupConnectionHandler(): void {
    const io = this.getIO();

    io.on('connection', (socket) => {
      const connection = new Connection(socket);
      this.connectionManager.addConnection(connection);

      console.log(`New connection: ${socket.id}`);

      // Initialize all plugins for this connection
      this.plugins.forEach((plugin) => {
        plugin.handleConnection(socket);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        const userId = connection.getUserId();
        console.log(`Disconnected: ${socket.id}${userId ? ` (${userId})` : ''}`);

        this.connectionManager.removeConnection(socket.id);

        // Broadcast user offline if they were authenticated
        if (userId && this.presencePlugin) {
          this.presencePlugin.broadcastUserOffline(userId);
        }
      });

      // When user authenticates, broadcast they're online
      socket.on('authenticated', () => {
        const userId = connection.getUserId();
        if (userId && this.presencePlugin) {
          this.presencePlugin.broadcastUserOnline(userId);
        }
      });
    });
  }

  /**
   * Start listening on a port (only for standalone servers)
   * If attached to existing server, that server should call listen()
   */
  public listen(port?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // If no IO initialized, create standalone server
      if (!this.io) {
        this.createStandalone();
      }

      // If we didn't create the HTTP server, user should call listen on their server
      if (!this.isOwnServer) {
        console.warn(
          'Socket server is attached to an existing HTTP server. ' +
          'Call listen() on your HTTP server instead.'
        );
        // Still initialize plugins
        this.plugins.forEach((plugin) => {
          plugin.initialize();
        });
        return resolve();
      }

      if (!this.httpServer) {
        return reject(new Error('HTTP server not initialized'));
      }

      const listenPort = port || this.config.port || 3000;

      // Initialize all plugins
      this.plugins.forEach((plugin) => {
        plugin.initialize();
      });

      this.httpServer.listen(listenPort, () => {
        console.log(`WebSocket server listening on port ${listenPort}`);
        resolve();
      });
    });
  }

  /**
   * Initialize plugins without starting a server
   * Use this when attaching to an existing server that's already listening
   */
  public initialize(): this {
    if (!this.io) {
      throw new Error('Socket.IO server not initialized. Call attach() or createStandalone() first.');
    }

    this.plugins.forEach((plugin) => {
      plugin.initialize();
    });

    return this;
  }

  public getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  public getIO(): Server {
    if (!this.io) {
      throw new Error('Socket.IO server not initialized');
    }
    return this.io;
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.io) {
        this.io.close(() => {
          if (this.httpServer && this.isOwnServer) {
            this.httpServer.close(() => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}