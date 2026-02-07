# sockr-server

A plugin-based WebSocket server built on [Socket.IO](https://socket.io) for real-time messaging, authentication, and presence tracking.

## Installation

```bash
npm install sockr-server
```

## Quick Start

```typescript
import { SockerServer } from "sockr-server";

const server = new SockerServer({ cors: { origin: "*" } })
  .useAuth(async (token) => {
    // Validate token and return a User object, or null to reject
    const user = await validateToken(token);
    return user ? { id: user.id } : null;
  })
  .usePresence()
  .useMessaging();

await server.listen(3000);
```

## API

### `SockerServer`

The main server class that orchestrates plugins and manages the Socket.IO server lifecycle.

#### Constructor

```typescript
new SockerServer(config?: ServerConfig)
```

`ServerConfig` options:

| Option          | Type       | Description                       |
| --------------- | ---------- | --------------------------------- |
| `cors`          | `object`   | CORS configuration for Socket.IO  |
| `pingTimeout`   | `number`   | Ping timeout in ms                |
| `pingInterval`  | `number`   | Ping interval in ms               |
| `transports`    | `string[]` | Allowed transports (e.g. `["websocket"]`) |

#### Methods

| Method                        | Returns              | Description                              |
| ----------------------------- | -------------------- | ---------------------------------------- |
| `useAuth(handler)`            | `this`               | Enable authentication with a handler     |
| `usePresence()`               | `this`               | Enable presence tracking                 |
| `useMessaging()`              | `this`               | Enable direct messaging & typing indicators |
| `use(plugin)`                 | `this`               | Register a custom plugin                 |
| `listen(port)`                | `Promise<void>`      | Start the server on the given port       |
| `close()`                     | `Promise<void>`      | Gracefully shut down the server          |
| `getConnectionManager()`      | `ConnectionManager`  | Access the connection manager            |
| `getIO()`                     | `Server`             | Access the raw Socket.IO server instance |

### `ConnectionManager`

Tracks active connections with dual-map lookups by socket ID and user ID.

| Method                            | Returns                        | Description                           |
| --------------------------------- | ------------------------------ | ------------------------------------- |
| `addConnection(connection)`       | `void`                         | Register a new connection             |
| `removeConnection(socketId)`      | `void`                         | Remove a connection and clean up      |
| `getConnection(socketId)`         | `Connection \| undefined`      | Look up by socket ID                  |
| `getConnectionByUserId(userId)`   | `Connection \| undefined`      | Look up by user ID                    |
| `authenticateConnection(socketId, user)` | `void`                  | Authenticate and map a user           |
| `isUserOnline(userId)`            | `boolean`                      | Check if a user is connected          |
| `getOnlineUsers()`                | `string[]`                     | Get all online user IDs               |
| `getUsersOnlineStatus(userIds)`   | `Record<string, boolean>`      | Batch online status check             |
| `getTotalConnections()`           | `number`                       | Count all active connections          |

### `Connection`

Wraps a Socket.IO socket with authentication state.

| Method            | Returns          | Description                        |
| ----------------- | ---------------- | ---------------------------------- |
| `authenticate(user)` | `void`        | Mark the connection as authenticated |
| `getUser()`       | `User \| null`   | Get the authenticated user         |
| `getUserId()`     | `string \| null` | Get the user ID                    |
| `getSocketId()`   | `string`         | Get the socket ID                  |
| `isAuth()`        | `boolean`        | Check if authenticated             |
| `emit(event, data)` | `void`        | Send an event to the client        |
| `disconnect()`    | `void`           | Disconnect the socket              |
| `getSocket()`     | `Socket`         | Get the underlying Socket.IO socket |

## Built-in Plugins

### AuthPlugin

Handles token-based authentication. When a client emits an `AUTHENTICATE` event with a token, the provided `AuthHandler` validates it and either authenticates the connection or disconnects the client.

```typescript
type AuthHandler = (token: string) => Promise<User | null>;

server.useAuth(async (token) => {
  const user = await db.findUserByToken(token);
  return user ? { id: user.id } : null;
});
```

### PresencePlugin

Broadcasts user online/offline status to all connected clients. Responds to `GET_ONLINE_STATUS` requests with batch status lookups.

```typescript
server.usePresence();
```

### MessagePlugin

Routes direct messages between authenticated users and supports typing indicators (`TYPING_START` / `TYPING_STOP`). Messages are delivered with a generated UUID, timestamp, and sender metadata.

```typescript
server.useMessaging();
```

## Custom Plugins

Extend the abstract `Plugin` class to create custom plugins:

```typescript
import { Plugin } from "sockr-server";
import type { Server, Socket } from "socket.io";
import type { ConnectionManager } from "sockr-server";

class MyPlugin extends Plugin {
  constructor(io: Server, connectionManager: ConnectionManager) {
    super(io, connectionManager);
  }

  initialize(): void {
    // Called when server.listen() is invoked
  }

  handleConnection(socket: Socket): void {
    // Called for each new socket connection
    socket.on("my-event", (data) => {
      // Handle custom events
    });
  }
}

// Register it
server.use(new MyPlugin(server.getIO(), server.getConnectionManager()));
```

## Connection Lifecycle

```
Client connects
  -> Connection created & tracked
  -> Plugins receive handleConnection()
  -> Client sends AUTHENTICATE with token
  -> AuthPlugin validates & authenticates
  -> PresencePlugin broadcasts USER_ONLINE
  -> Client can send/receive messages
  -> Client disconnects
  -> PresencePlugin broadcasts USER_OFFLINE
  -> Connection removed & cleaned up
```

## Scripts

```bash
npm run dev     # Watch mode
npm run build   # Production build
npm run clean   # Remove dist/
```

## License

MIT
