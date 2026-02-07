# SOCKR Server SDK — Documentation

Complete reference for the `sockr-server` package.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Server Configuration](#server-configuration)
- [Authentication](#authentication)
- [Presence Tracking](#presence-tracking)
- [Messaging](#messaging)
- [Typing Indicators](#typing-indicators)
- [Connection Management](#connection-management)
- [Custom Plugins](#custom-plugins)
- [Socket Events Reference](#socket-events-reference)
- [Error Handling](#error-handling)
- [Graceful Shutdown](#graceful-shutdown)
- [Full Example](#full-example)

---

## Installation

```bash
npm install sockr-server
```

`sockr-shared` is installed as a dependency. All shared types (`SocketEvent`, `User`, `ServerConfig`, etc.) are re-exported from `sockr-server` so you can import everything from a single package.

```typescript
import { SockerServer, SocketEvent, User, ServerConfig } from "sockr-server";
```

> For the full shared types reference, see the [sockr-shared Documentation](../shared/Documentation.md).

---

## Quick Start

```typescript
import { SockerServer } from "sockr-server";

const server = new SockerServer();

await server.listen(3000);
// Socket server listening on port 3000
```

This starts a bare server with no plugins. Clients can connect, but there is no authentication, presence, or messaging until you enable them.

---

## Server Configuration

Pass a `ServerConfig` object to the constructor to customize the server.

```typescript
import { SockerServer } from "sockr-server";

const server = new SockerServer({
  cors: {
    origin: "https://myapp.com",
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
});
```

| Field           | Type                               | Default                          | Description                             |
| --------------- | ---------------------------------- | -------------------------------- | --------------------------------------- |
| `cors`          | `{ origin: string \| string[]; credentials?: boolean }` | `{ origin: "*", credentials: true }` | CORS settings passed to Socket.IO |
| `pingTimeout`   | `number`                           | `60000`                          | How long (ms) without a pong before closing the connection |
| `pingInterval`  | `number`                           | `25000`                          | How often (ms) to send a ping           |
| `transports`    | `("websocket" \| "polling")[]`     | `["websocket", "polling"]`       | Allowed transport methods               |

---

## Authentication

Enable authentication by calling `useAuth()` with an `AuthHandler` function. The handler receives a token string and must return a `User` object on success or `null` to reject.

```typescript
import { SockerServer, AuthHandler } from "sockr-server";

const authHandler: AuthHandler = async (token: string) => {
  // Look up the user by token — from a database, JWT decode, etc.
  const user = await db.findUserByToken(token);

  if (!user) return null; // Reject — client will be disconnected

  // Return a User object. Only `id` is required from you.
  // `socketId` and `connectedAt` are set automatically by the server.
  return { id: user.id };
};

const server = new SockerServer()
  .useAuth(authHandler);

await server.listen(3000);
```

### `AuthHandler`

```typescript
type AuthHandler = (token: string) => Promise<User | null>;
```

### How It Works

1. A client connects and emits an `authenticate` event with `{ token: string }`.
2. The server calls your `AuthHandler` with the token.
3. **If the handler returns a `User`:**
   - The server sets `user.socketId` and `user.connectedAt` automatically.
   - The connection is marked as authenticated.
   - The client receives an `authenticated` event with `{ userId, socketId }`.
4. **If the handler returns `null`:**
   - The client receives an `auth_error` event with `{ message: "Invalid authentication token" }`.
   - The socket is disconnected.
5. **If the handler throws an error:**
   - The client receives an `auth_error` event with `{ message: "Authentication failed" }`.
   - The socket is disconnected.

### Client-Side Usage

```typescript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.emit("authenticate", { token: "my-auth-token" });

socket.on("authenticated", (data) => {
  console.log("Authenticated as", data.userId);
  // { userId: string, socketId: string }
});

socket.on("auth_error", (data) => {
  console.error("Auth failed:", data.message);
  // { message: string }
});
```

---

## Presence Tracking

Enable presence to broadcast online/offline status and allow clients to query who is online.

```typescript
const server = new SockerServer()
  .useAuth(authHandler)
  .usePresence();

await server.listen(3000);
```

> **Note:** Presence requires authentication. A user is considered "online" once they have authenticated.

### Automatic Broadcasts

When a user authenticates, the server broadcasts to **all connected clients**:

```typescript
// All clients receive:
socket.on("user_online", (data) => {
  console.log(data.userId, "is now online");
  // { userId: string }
});
```

When a user disconnects, the server broadcasts:

```typescript
socket.on("user_offline", (data) => {
  console.log(data.userId, "went offline");
  // { userId: string }
});
```

### Querying Online Status

Clients can request the status of specific users:

```typescript
// Client sends:
socket.emit("get_online_status", {
  userIds: ["user-1", "user-2", "user-3"],
});

// Client receives:
socket.on("online_status", (data) => {
  console.log(data.statuses);
  // { "user-1": true, "user-2": false, "user-3": true }
});
```

### Server-Side Access

You can also check presence programmatically on the server:

```typescript
const manager = server.getConnectionManager();

manager.isUserOnline("user-1");
// true | false

manager.getOnlineUsers();
// ["user-1", "user-3"]

manager.getUsersOnlineStatus(["user-1", "user-2"]);
// { "user-1": true, "user-2": false }
```

---

## Messaging

Enable direct messaging between authenticated users.

```typescript
const server = new SockerServer()
  .useAuth(authHandler)
  .useMessaging();

await server.listen(3000);
```

### Sending a Message

```typescript
// Sender emits:
socket.emit("send_message", {
  to: "recipient-user-id",
  content: "Hello!",
  metadata: { type: "text" }, // optional
});
```

### Receiving a Message

```typescript
// Recipient receives:
socket.on("receive_message", (data) => {
  console.log(data);
  // {
  //   from: "sender-user-id",
  //   content: "Hello!",
  //   timestamp: 1707300000000,
  //   messageId: "550e8400-e29b-41d4-a716-446655440000",
  //   metadata: { type: "text" }
  // }
});
```

### Delivery Confirmation

```typescript
// Sender receives on successful delivery:
socket.on("message_delivered", (data) => {
  console.log("Delivered:", data.messageId);
  // { messageId: string }
});
```

### Message Errors

```typescript
// Sender receives if something goes wrong:
socket.on("message_error", (data) => {
  console.error(data.error);
  // { messageId?: string, error: string }
});
```

Possible error messages:

| Error                   | Cause                                          |
| ----------------------- | ---------------------------------------------- |
| `"Not authenticated"`   | Sender has not completed authentication        |
| `"Invalid user"`        | Sender's user ID could not be resolved         |
| `"Recipient is offline"`| The recipient is not currently connected       |

---

## Typing Indicators

Typing indicators are part of the messaging plugin. Enable them by calling `useMessaging()`.

### Sending Typing State

```typescript
// Notify recipient that you started typing:
socket.emit("typing_start", { to: "recipient-user-id" });

// Notify recipient that you stopped typing:
socket.emit("typing_stop", { to: "recipient-user-id" });
```

### Receiving Typing State

```typescript
socket.on("typing_start", (data) => {
  console.log(data.from, "is typing...");
  // { from: string }
});

socket.on("typing_stop", (data) => {
  console.log(data.from, "stopped typing");
  // { from: string }
});
```

> **Note:** Typing indicators fail silently. If the sender is not authenticated or the recipient is offline, nothing happens — no error is emitted.

---

## Connection Management

The `ConnectionManager` tracks all active connections with dual-map lookups by socket ID and user ID.

### Accessing the Manager

```typescript
const manager = server.getConnectionManager();
```

### `ConnectionManager` Methods

#### Look Up Connections

```typescript
// By socket ID
const conn = manager.getConnection("socket-id");

// By user ID (only works after authentication)
const conn = manager.getConnectionByUserId("user-id");
```

#### Manage Connections

```typescript
// Register a connection
manager.addConnection(connection);

// Remove a connection and clean up user mapping
manager.removeConnection("socket-id");

// Authenticate a connection and map user ID to socket ID
manager.authenticateConnection("socket-id", user);
```

#### Check Online Status

```typescript
manager.isUserOnline("user-id");
// true | false

manager.getOnlineUsers();
// ["user-1", "user-2"]

manager.getUsersOnlineStatus(["user-1", "user-2", "user-3"]);
// { "user-1": true, "user-2": false, "user-3": true }
```

#### Connection Count

```typescript
manager.getTotalConnections();
// 42
```

### Working with a `Connection`

```typescript
const conn = manager.getConnectionByUserId("user-1");

if (conn) {
  conn.isAuth();        // true
  conn.getUserId();     // "user-1"
  conn.getUser();       // { id: "user-1", socketId: "abc", connectedAt: 1707300000000 }
  conn.getSocketId();   // "abc"
  conn.getSocket();     // Raw Socket.IO socket

  // Send a custom event
  conn.emit("custom-event", { hello: "world" });

  // Kick the user
  conn.disconnect();
}
```

### `Connection` Methods

| Method               | Returns          | Description                          |
| -------------------- | ---------------- | ------------------------------------ |
| `authenticate(user)` | `void`           | Mark the connection as authenticated |
| `getUser()`          | `User \| null`   | Get the authenticated user           |
| `getUserId()`        | `string \| null` | Get the user ID                      |
| `getSocketId()`      | `string`         | Get the socket ID                    |
| `isAuth()`           | `boolean`        | Check if authenticated               |
| `emit(event, data)`  | `void`           | Send an event to the client          |
| `disconnect()`       | `void`           | Disconnect the socket                |
| `getSocket()`        | `Socket`         | Get the underlying Socket.IO socket  |

---

## Custom Plugins

Extend the abstract `Plugin` class to add custom behavior to the server.

### Plugin Interface

Every plugin must implement two methods:

- `initialize()` — called once when `server.listen()` is invoked.
- `handleConnection(socket)` — called for every new socket connection.

```typescript
import { Plugin } from "sockr-server";
import type { Server, Socket } from "socket.io";
import type { ConnectionManager } from "sockr-server";

class RateLimitPlugin extends Plugin {
  private limits = new Map<string, number>();

  constructor(io: Server, connectionManager: ConnectionManager) {
    super(io, connectionManager);
  }

  initialize(): void {
    // Setup that doesn't depend on individual sockets
    console.log("RateLimitPlugin initialized");
  }

  handleConnection(socket: Socket): void {
    // Attach event listeners for each new connection
    socket.on("send_message", () => {
      const count = this.limits.get(socket.id) || 0;
      if (count > 100) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }
      this.limits.set(socket.id, count + 1);
    });

    socket.on("disconnect", () => {
      this.limits.delete(socket.id);
    });
  }
}
```

### Registering a Custom Plugin

Custom plugins need access to the `io` and `connectionManager` instances. Retrieve them from the server and register the plugin before calling `listen()`:

```typescript
const server = new SockerServer()
  .useAuth(authHandler)
  .usePresence()
  .useMessaging();

const plugin = new RateLimitPlugin(server.getIO(), server.getConnectionManager());
server.use(plugin);

await server.listen(3000);
```

### Plugin Lifecycle

```
server = new SockerServer()       → Server created, connection handler set up
server.use(plugin)                → Plugin added to the plugin array
server.listen(port)               → plugin.initialize() called for each plugin
                                  → HTTP server starts listening
client connects                   → plugin.handleConnection(socket) called for each plugin
client disconnects                → socket 'disconnect' event fires (handle in your plugin)
```

### Accessing Server Internals from Plugins

Inside a plugin, you have access to two protected properties:

```typescript
this.io                // Socket.IO Server instance — for broadcasting
this.connectionManager // ConnectionManager — for looking up connections
```

---

## Socket Events Reference

### Client → Server

| Event                | Payload                                               | Requires Auth | Plugin    |
| -------------------- | ----------------------------------------------------- | ------------- | --------- |
| `authenticate`       | `{ token: string }`                                   | No            | Auth      |
| `get_online_status`  | `{ userIds: string[] }`                               | No            | Presence  |
| `send_message`       | `{ to: string, content: string, metadata?: object }`  | Yes           | Message   |
| `typing_start`       | `{ to: string }`                                      | Yes           | Message   |
| `typing_stop`        | `{ to: string }`                                      | Yes           | Message   |

### Server → Client

| Event                | Payload                                                                       | Recipient     | Plugin    |
| -------------------- | ----------------------------------------------------------------------------- | ------------- | --------- |
| `authenticated`      | `{ userId: string, socketId: string }`                                        | Sender        | Auth      |
| `auth_error`         | `{ message: string }`                                                         | Sender        | Auth      |
| `user_online`        | `{ userId: string }`                                                          | All clients   | Presence  |
| `user_offline`       | `{ userId: string }`                                                          | All clients   | Presence  |
| `online_status`      | `{ statuses: Record<string, boolean> }`                                       | Sender        | Presence  |
| `receive_message`    | `{ from: string, content: string, timestamp: number, messageId: string, metadata?: object }` | Recipient | Message |
| `message_delivered`  | `{ messageId: string }`                                                       | Sender        | Message   |
| `message_error`      | `{ messageId?: string, error: string }`                                       | Sender        | Message   |
| `typing_start`       | `{ from: string }`                                                            | Recipient     | Message   |
| `typing_stop`        | `{ from: string }`                                                            | Recipient     | Message   |

---

## Error Handling

### Authentication Errors

| Scenario                        | Event        | Payload                                       | Socket Disconnected |
| ------------------------------- | ------------ | --------------------------------------------- | ------------------- |
| `AuthHandler` returns `null`    | `auth_error` | `{ message: "Invalid authentication token" }` | Yes                 |
| `AuthHandler` throws an error   | `auth_error` | `{ message: "Authentication failed" }`        | Yes                 |

### Message Errors

| Scenario                   | Event           | Payload                                             |
| -------------------------- | --------------- | --------------------------------------------------- |
| Sender not authenticated   | `message_error` | `{ error: "Not authenticated" }`                    |
| Sender user ID unresolved  | `message_error` | `{ error: "Invalid user" }`                         |
| Recipient is offline       | `message_error` | `{ messageId: string, error: "Recipient is offline" }` |

### Typing Indicator Errors

Typing indicators **fail silently**. No error event is emitted if:
- The sender is not authenticated.
- The recipient is offline.

---

## Graceful Shutdown

```typescript
const server = new SockerServer();
await server.listen(3000);

// Later, shut down cleanly:
await server.close();
// Closes all socket connections and the HTTP server
```

### With Process Signals

```typescript
process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});
```

---

## Full Example

A complete server with all features enabled:

```typescript
import { SockerServer, AuthHandler } from "sockr-server";

// Define your auth logic
const authHandler: AuthHandler = async (token) => {
  // Replace with your own validation (JWT, database lookup, etc.)
  const users: Record<string, { id: string }> = {
    "token-alice": { id: "alice" },
    "token-bob": { id: "bob" },
  };

  return users[token] || null;
};

// Create server with all plugins
const server = new SockerServer({
  cors: { origin: "*" },
  transports: ["websocket"],
})
  .useAuth(authHandler)
  .usePresence()
  .useMessaging();

// Access internals if needed
const manager = server.getConnectionManager();
const io = server.getIO();

// Listen for raw Socket.IO events via the io instance
io.on("connection", (socket) => {
  console.log("Raw connection event:", socket.id);
});

// Start the server
await server.listen(3000);
console.log("Server running on port 3000");

// Graceful shutdown
process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});
```

### Matching Client

```typescript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  transports: ["websocket"],
});

// 1. Authenticate
socket.emit("authenticate", { token: "token-alice" });

socket.on("authenticated", (data) => {
  console.log("Logged in as", data.userId);

  // 2. Check who's online
  socket.emit("get_online_status", { userIds: ["bob"] });

  // 3. Send a message
  socket.emit("send_message", {
    to: "bob",
    content: "Hey Bob!",
    metadata: { type: "text" },
  });

  // 4. Send typing indicator
  socket.emit("typing_start", { to: "bob" });
  setTimeout(() => {
    socket.emit("typing_stop", { to: "bob" });
  }, 2000);
});

socket.on("auth_error", (data) => {
  console.error("Auth failed:", data.message);
});

// Listen for presence
socket.on("user_online", (data) => console.log(data.userId, "online"));
socket.on("user_offline", (data) => console.log(data.userId, "offline"));
socket.on("online_status", (data) => console.log("Statuses:", data.statuses));

// Listen for messages
socket.on("receive_message", (data) => {
  console.log(`Message from ${data.from}: ${data.content}`);
});
socket.on("message_delivered", (data) => {
  console.log("Delivered:", data.messageId);
});
socket.on("message_error", (data) => {
  console.error("Message failed:", data.error);
});

// Listen for typing
socket.on("typing_start", (data) => console.log(data.from, "is typing..."));
socket.on("typing_stop", (data) => console.log(data.from, "stopped typing"));
```
