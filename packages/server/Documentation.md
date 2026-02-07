# SOCKR Server SDK — Documentation

Complete reference for the `sockr-server` package.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Server Modes](#server-modes)
  - [Standalone](#standalone)
  - [Attach to HTTP Server](#attach-to-an-existing-http-server)
  - [Attach to Express](#attach-to-express)
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
- [Full Examples](#full-examples)

---

## Installation

```bash
npm install sockr-server
```

`sockr-shared` is installed as a dependency. All shared types (`SocketEvent`, `User`, `ServerConfig`, etc.) are re-exported from `sockr-server` so you can import everything from a single package.

```typescript
import { SocketServer, SocketEvent, User, ServerConfig } from "sockr-server";
```

> For the full shared types reference, see the [sockr-shared Documentation](../shared/Documentation.md).

---

## Quick Start

```typescript
import { SocketServer } from "sockr-server";

const server = new SocketServer()
  .createStandalone()
  .useAuth(async (token) => {
    const user = await validateToken(token);
    return user ? { id: user.id } : null;
  })
  .usePresence()
  .useMessaging();

await server.listen(3000);
```

---

## Server Modes

`SocketServer` supports three ways to initialize, depending on whether you have an existing server.

> **Important:** You must call `attach()`, `attachToExpress()`, or `createStandalone()` before calling any plugin method (`useAuth`, `usePresence`, `useMessaging`). These methods require the Socket.IO instance to be initialized first.

### Standalone

Creates its own HTTP server. Use this when you don't have an existing server.

```typescript
const server = new SocketServer()
  .createStandalone()
  .useAuth(authHandler)
  .usePresence()
  .useMessaging();

await server.listen(3000);
```

If you call `listen()` without initializing first, it automatically calls `createStandalone()` for you:

```typescript
const server = new SocketServer();
await server.listen(3000); // creates standalone server implicitly
```

> Note: In this case you cannot chain plugin methods before `listen()`, since the Socket.IO instance doesn't exist yet.

### Attach to an Existing HTTP Server

Use `attach()` when you already have an HTTP or HTTPS server (Express, Fastify, Koa, raw `http.createServer`, etc.).

```typescript
import express from "express";
import { createServer } from "http";
import { SocketServer } from "sockr-server";

const app = express();
const httpServer = createServer(app);

// Attach sockr to the existing server
const sockr = new SocketServer()
  .attach(httpServer)
  .useAuth(authHandler)
  .usePresence()
  .useMessaging()
  .initialize(); // initialize plugins

// Express routes work as normal
app.get("/health", (req, res) => res.send("ok"));

// Start both on the same port
httpServer.listen(3000);
```

When using `attach()`, the server is **not owned** by sockr. This means:
- Call `listen()` on your HTTP server, not on sockr.
- `sockr.close()` will close Socket.IO but will **not** close the HTTP server.
- Call `initialize()` to initialize plugins after setting them up.

### Attach to Express

A convenience method that wraps your Express app in an HTTP server for you.

```typescript
import express from "express";
import { SocketServer } from "sockr-server";

const app = express();

const sockr = new SocketServer()
  .attachToExpress(app)
  .useAuth(authHandler)
  .usePresence()
  .useMessaging();

await sockr.listen(3000);
```

With `attachToExpress()`, sockr **owns** the HTTP server, so you can call `sockr.listen()` and `sockr.close()` directly.

---

## Server Configuration

Pass a `ServerConfig` object to the constructor to customize the server.

```typescript
const server = new SocketServer({
  cors: {
    origin: "https://myapp.com",
    credentials: true,
  },
  port: 8080,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
});
```

| Field           | Type                               | Default                          | Description                             |
| --------------- | ---------------------------------- | -------------------------------- | --------------------------------------- |
| `port`          | `number`                           | `3000`                           | Default port used by `listen()` if none is passed |
| `cors`          | `{ origin: string \| string[]; credentials?: boolean }` | `{ origin: "*", credentials: true }` | CORS settings passed to Socket.IO |
| `pingTimeout`   | `number`                           | `60000`                          | How long (ms) without a pong before closing the connection |
| `pingInterval`  | `number`                           | `25000`                          | How often (ms) to send a ping           |
| `transports`    | `("websocket" \| "polling")[]`     | `["websocket", "polling"]`       | Allowed transport methods               |

The port used by `listen()` is resolved as: argument > `config.port` > `3000`.

---

## Authentication

Enable authentication by calling `useAuth()` with an `AuthHandler` function. The handler receives a token string and must return a `User` object on success or `null` to reject.

```typescript
import { SocketServer, AuthHandler } from "sockr-server";

const authHandler: AuthHandler = async (token: string) => {
  // Look up the user by token — from a database, JWT decode, etc.
  const user = await db.findUserByToken(token);

  if (!user) return null; // Reject — client will be disconnected

  // Return a User object. Only `id` is required from you.
  // `socketId` and `connectedAt` are set automatically by the server.
  return { id: user.id };
};

const server = new SocketServer()
  .createStandalone()
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
const server = new SocketServer()
  .createStandalone()
  .useAuth(authHandler)
  .usePresence();

await server.listen(3000);
```

> **Note:** Presence requires authentication. A user is considered "online" once they have authenticated.

### Automatic Broadcasts

When a user authenticates, the server broadcasts to **all connected clients**:

```typescript
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
const server = new SocketServer()
  .createStandalone()
  .useAuth(authHandler)
  .useMessaging();

await server.listen(3000);
```

### Sending a Message

```typescript
socket.emit("send_message", {
  to: "recipient-user-id",
  content: "Hello!",
  metadata: { type: "text" }, // optional
});
```

### Receiving a Message

```typescript
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
socket.on("message_delivered", (data) => {
  console.log("Delivered:", data.messageId);
  // { messageId: string }
});
```

### Message Errors

```typescript
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
socket.emit("typing_start", { to: "recipient-user-id" });
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
manager.addConnection(connection);
manager.removeConnection("socket-id");
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

- `initialize()` — called when plugins are initialized (via `listen()` or `initialize()`).
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
    console.log("RateLimitPlugin initialized");
  }

  handleConnection(socket: Socket): void {
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

Register custom plugins after initializing the server mode and before starting:

```typescript
const server = new SocketServer()
  .createStandalone()
  .useAuth(authHandler)
  .usePresence()
  .useMessaging();

const plugin = new RateLimitPlugin(server.getIO(), server.getConnectionManager());
server.use(plugin);

await server.listen(3000);
```

### Plugin Lifecycle

```
new SocketServer()                → Config stored, ConnectionManager created
server.createStandalone()         → HTTP server + Socket.IO created, connection handler set up
  (or server.attach(httpServer))
server.useAuth() / use()          → Plugins registered
server.listen() / initialize()    → plugin.initialize() called for each plugin
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

### Initialization Errors

| Scenario                                           | Error                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| Calling `useAuth`/`usePresence`/`useMessaging` before `attach`/`createStandalone` | `"Socket.IO server not initialized"` |
| Calling `attach`/`createStandalone` twice          | `"Socket.IO server already initialized"`                              |
| Calling `initialize()` before `attach`/`createStandalone` | `"Socket.IO server not initialized. Call attach() or createStandalone() first."` |

---

## Graceful Shutdown

```typescript
await server.close();
```

- **Standalone / `attachToExpress`:** Closes Socket.IO and the HTTP server.
- **`attach()`:** Closes Socket.IO only. The HTTP server is yours to manage.

### With Process Signals

```typescript
process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});
```

---

## Full Examples

### Standalone Server

```typescript
import { SocketServer, AuthHandler } from "sockr-server";

const authHandler: AuthHandler = async (token) => {
  const users: Record<string, { id: string }> = {
    "token-alice": { id: "alice" },
    "token-bob": { id: "bob" },
  };
  return users[token] || null;
};

const server = new SocketServer({
  cors: { origin: "*" },
  transports: ["websocket"],
})
  .createStandalone()
  .useAuth(authHandler)
  .usePresence()
  .useMessaging();

await server.listen(3000);
```

### Express Integration

```typescript
import express from "express";
import { createServer } from "http";
import { SocketServer } from "sockr-server";

const app = express();
const httpServer = createServer(app);

app.get("/health", (req, res) => res.send("ok"));
app.get("/online", (req, res) => {
  const users = sockr.getConnectionManager().getOnlineUsers();
  res.json({ users });
});

const sockr = new SocketServer({ cors: { origin: "*" } })
  .attach(httpServer)
  .useAuth(async (token) => {
    const user = await db.findUserByToken(token);
    return user ? { id: user.id } : null;
  })
  .usePresence()
  .useMessaging()
  .initialize();

httpServer.listen(3000, () => {
  console.log("Express + SOCKR running on port 3000");
});
```

### Express (Convenience Method)

```typescript
import express from "express";
import { SocketServer } from "sockr-server";

const app = express();

app.get("/health", (req, res) => res.send("ok"));

const sockr = new SocketServer({ cors: { origin: "*" } })
  .attachToExpress(app)
  .useAuth(authHandler)
  .usePresence()
  .useMessaging();

await sockr.listen(3000);
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

  // 4. Typing indicators
  socket.emit("typing_start", { to: "bob" });
  setTimeout(() => {
    socket.emit("typing_stop", { to: "bob" });
  }, 2000);
});

socket.on("auth_error", (data) => {
  console.error("Auth failed:", data.message);
});

// Presence
socket.on("user_online", (data) => console.log(data.userId, "online"));
socket.on("user_offline", (data) => console.log(data.userId, "offline"));
socket.on("online_status", (data) => console.log("Statuses:", data.statuses));

// Messages
socket.on("receive_message", (data) => {
  console.log(`Message from ${data.from}: ${data.content}`);
});
socket.on("message_delivered", (data) => {
  console.log("Delivered:", data.messageId);
});
socket.on("message_error", (data) => {
  console.error("Message failed:", data.error);
});

// Typing
socket.on("typing_start", (data) => console.log(data.from, "is typing..."));
socket.on("typing_stop", (data) => console.log(data.from, "stopped typing"));
```
