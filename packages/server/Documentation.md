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
- [Group Messaging](#group-messaging)
- [Voice Calling](#voice-calling)
- [Group Conference Calling](#group-conference-calling)
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
| `voice`         | `VoiceConfig`                      | `undefined`                      | ICE/TURN configuration for voice calling (see [Voice Calling](#voice-calling)) |

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

## Group Messaging

Enable multi-user group chats with persistent membership, message history, offline queuing, and per-group typing indicators.

```typescript
const server = new SocketServer()
  .createStandalone()
  .useAuth(authHandler)
  .useGroupMessaging();

await server.listen(3000);
```

> **Note:** Group messaging requires a `messageStore`, `queue`, and `cache` provider. By default the server uses in-memory implementations. Pass custom providers to `useGroupMessaging()` for production use.

### Creating a Group

```typescript
// Client sends:
socket.emit("group_create", {
  name: "My Group",
  members: ["user-2", "user-3"], // optional initial members
  metadata: { topic: "general" }, // optional
});

// Client receives:
socket.on("group_created", (data) => {
  console.log(data.group);
  // {
  //   id: "550e8400-...",
  //   name: "My Group",
  //   createdBy: "user-1",
  //   createdAt: 1707300000000,
  //   members: ["user-1", "user-2", "user-3"],
  //   metadata: { topic: "general" }
  // }
});

// On error:
socket.on("group_create_error", (data) => {
  console.error(data.error);
  // { error: string }
});
```

The creator is automatically added as `admin`. Invited members are added as `member`. All of a member's active sockets (tabs/devices) are joined to the Socket.IO room immediately.

### Joining a Group

```typescript
// Client sends:
socket.emit("group_join", { groupId: "550e8400-..." });

// Client receives confirmation plus queued messages missed while offline:
socket.on("group_joined", (data) => {
  console.log(data.group, data.queuedMessages);
  // {
  //   groupId: string,
  //   group: Group,
  //   queuedMessages: PersistedMessage[]
  // }
});

// On error:
socket.on("group_join_error", (data) => {
  console.error(data.error);
  // { groupId: string, error: string }
});

// Other group members receive:
socket.on("group_member_joined", (data) => {
  // { groupId: string, member: { userId: string, role: "member", joinedAt: number } }
});
```

### Leaving a Group

```typescript
// Client sends:
socket.emit("group_leave", { groupId: "550e8400-..." });

// Client receives:
socket.on("group_left", (data) => {
  // { groupId: string }
});

// Other group members receive:
socket.on("group_member_left", (data) => {
  // { groupId: string, userId: string }
});
```

### Sending a Group Message

```typescript
// Client sends:
socket.emit("group_send_message", {
  groupId: "550e8400-...",
  content: "Hello group!",
  metadata: { type: "text" }, // optional
});

// All online group members receive:
socket.on("group_receive_message", (data) => {
  console.log(data);
  // {
  //   groupId: string,
  //   messageId: string,
  //   from: string,
  //   content: string,
  //   timestamp: number,
  //   metadata?: object
  // }
});

// Sender receives delivery confirmation:
socket.on("group_message_delivered", (data) => {
  // { groupId: string, messageId: string }
});

// On error:
socket.on("group_message_error", (data) => {
  // { groupId: string, messageId?: string, error: string }
});
```

Offline members receive queued messages the next time they call `group_join`.

### Read Receipts

```typescript
// Client sends:
socket.emit("group_message_read", {
  groupId: "550e8400-...",
  messageId: "message-uuid",
});

// Other group members receive:
socket.on("group_message_read", (data) => {
  // { groupId: string, messageId: string }
});
```

### Group Typing Indicators

```typescript
socket.emit("group_typing_start", { groupId: "550e8400-..." });
socket.emit("group_typing_stop", { groupId: "550e8400-..." });

// Other group members receive:
socket.on("group_typing_start", (data) => {
  // { groupId: string, from: string }
});
socket.on("group_typing_stop", (data) => {
  // { groupId: string, from: string }
});
```

### Querying Group Data

```typescript
// Get members of a group:
socket.emit("get_group_members", { groupId: "550e8400-..." });
socket.on("group_members", (data) => {
  // { groupId: string, members: GroupMember[] }
});

// Get all groups the current user belongs to:
socket.emit("get_user_groups");
socket.on("user_groups", (data) => {
  // { groups: Group[] }
});

// Get message history:
socket.emit("get_group_message_history", {
  groupId: "550e8400-...",
  limit: 50,    // optional, default 50
  before: 1707300000000, // optional timestamp cursor for pagination
});
socket.on("group_message_history", (data) => {
  // { groupId: string, messages: PersistedMessage[] }
});
```

---

## Voice Calling

Enable WebRTC peer-to-peer voice calls. The server handles only signaling (SDP offers/answers and ICE candidates) — media never passes through the server.

```typescript
const server = new SocketServer({
  voice: {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    turn: {
      urls: "turn:turn.example.com:3478",
      secret: "my-coturn-static-secret",
      ttl: 3600,
    },
  },
})
  .createStandalone()
  .useAuth(authHandler)
  .useVoice();

await server.listen(3000);
```

### VoiceConfig

| Field        | Type                          | Description                                              |
| ------------ | ----------------------------- | -------------------------------------------------------- |
| `iceServers` | `IceServer[]`                 | Static STUN/TURN servers always included in ICE list     |
| `turn`       | `TurnConfig`                  | TURN server with HMAC-SHA1 credential generation         |

**`TurnConfig`:**

| Field    | Type                   | Default | Description                                   |
| -------- | ---------------------- | ------- | --------------------------------------------- |
| `urls`   | `string \| string[]`   | —       | TURN server URL(s)                            |
| `secret` | `string`               | —       | Shared TURN secret (never sent to the client) |
| `ttl`    | `number`               | `3600`  | Credential lifetime in seconds                |

HMAC-SHA1 credentials are generated per user on each request. The format is `username = "${expiry}:${userId}"`, `credential = HMAC-SHA1(secret, username)`.

### Getting ICE Servers

Clients should fetch ICE servers before initiating a call:

```typescript
// Client sends:
socket.emit("call_get_ice_servers");

// Client receives:
socket.on("call_ice_servers", (data) => {
  console.log(data.iceServers);
  // [
  //   { urls: "stun:stun.l.google.com:19302" },
  //   { urls: "turn:turn.example.com:3478", username: "1707303600:user-1", credential: "..." }
  // ]
});
```

### Initiating a Call

```typescript
// Caller sends:
socket.emit("call_initiate", {
  to: "callee-user-id",
  sdpOffer: offer.sdp, // RTCSessionDescription SDP string
});

// Caller receives (call is ringing):
socket.on("call_ringing", (data) => {
  // { callId: string }
});

// Callee receives on ALL their connected devices:
socket.on("call_incoming", (data) => {
  // {
  //   callId: string,
  //   from: string,
  //   sdpOffer: string,
  //   iceServers: IceServer[]  // fresh credentials for the callee
  // }
});

// If callee is already in a call:
socket.on("call_busy", (data) => {
  // { callId: string }
});

// If callee is offline:
socket.on("call_ended", (data) => {
  // { callId: string }  (callId is empty string when callee is offline)
});
```

### Answering a Call

```typescript
// Callee sends:
socket.emit("call_answer", {
  callId: "call-uuid",
  sdpAnswer: answer.sdp,
});

// Caller receives on ALL their connected devices:
socket.on("call_answered", (data) => {
  // { callId: string, sdpAnswer: string }
});
```

### Rejecting a Call

```typescript
// Callee sends:
socket.emit("call_reject", { callId: "call-uuid" });

// Caller receives:
socket.on("call_rejected", (data) => {
  // { callId: string }
});
```

### Hanging Up

```typescript
// Either party sends:
socket.emit("call_hangup", { callId: "call-uuid" });

// The other party receives:
socket.on("call_ended", (data) => {
  // { callId: string }
});
```

### ICE Candidates

Exchange ICE candidates throughout the call setup:

```typescript
// Either party sends:
socket.emit("call_ice_candidate", {
  callId: "call-uuid",
  candidate: {
    candidate: "candidate:...",
    sdpMid: "0",
    sdpMLineIndex: 0,
  },
});

// The other party receives the same event:
socket.on("call_ice_candidate", (data) => {
  // { callId: string, candidate: IceCandidateInit }
});
```

### Automatic Cleanup

When a user's **last** socket disconnects, all active or ringing calls they are in are ended automatically. The other party receives `call_ended`.

---

## Group Conference Calling

Enable SFU-based group audio/video calls for group members. Unlike P2P voice calling, media is routed through a Selective Forwarding Unit (SFU) so any number of participants can join. The server handles room creation, short-lived token issuance, and participant lifecycle — the SFU handles media.

```typescript
import { LiveKitSFUProvider } from "sockr-server";

const server = new SocketServer()
  .createStandalone()
  .useAuth(authHandler)
  .useGroupMessaging() // Conference requires group membership data
  .useConference(
    new LiveKitSFUProvider({
      apiKey: process.env.LIVEKIT_API_KEY!,
      apiSecret: process.env.LIVEKIT_API_SECRET!,
      host: "https://your-livekit.example.com",
    }),
    "wss://your-livekit.example.com"
  );

await server.listen(3000);
```

> **Note:** The `LiveKitSFUProvider` requires `livekit-server-sdk` installed in your project: `npm install livekit-server-sdk`. You can supply any SFU by implementing the `ISFUProvider` interface instead.

### `useConference(sfuProvider, sfuUrl)`

| Parameter     | Type            | Description                                                              |
| ------------- | --------------- | ------------------------------------------------------------------------ |
| `sfuProvider` | `ISFUProvider`  | Handles SFU room creation and short-lived token generation               |
| `sfuUrl`      | `string`        | WebSocket URL of the SFU server, sent to clients so they can connect     |

### `ISFUProvider` Interface

Implement this to use a different SFU:

```typescript
interface ISFUProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  generateToken(roomName: string, participantIdentity: string, opts?: TokenOptions): Promise<string>;
  createRoom?(roomName: string, opts?: RoomOptions): Promise<void>;
  deleteRoom?(roomName: string): Promise<void>;
}
```

### Joining a Conference

```typescript
// Client sends (must be a member of the group):
socket.emit("conference_join", { groupId: "group-uuid" });

// Client receives a short-lived SFU token:
socket.on("conference_token", (data) => {
  // { groupId: string, sfuUrl: string, token: string }
  // Connect to the SFU using the token and sfuUrl
});

// All group members receive:
socket.on("conference_started", (data) => {
  // { groupId: string, startedBy: string, participantCount: number }
});

// Subsequent joiners — other members receive:
socket.on("conference_participant_joined", (data) => {
  // { groupId: string, userId: string, participantCount: number }
});

// On error:
socket.on("conference_error", (data) => {
  // { groupId: string, error: string }
});
```

### Leaving a Conference

```typescript
// Client sends:
socket.emit("conference_leave", { groupId: "group-uuid" });

// Other participants receive:
socket.on("conference_participant_left", (data) => {
  // { groupId: string, userId: string, participantCount: number }
});

// When the last participant leaves, all receive:
socket.on("conference_ended", (data) => {
  // { groupId: string }
});
```

### Conference Automatic Cleanup

When a user's **last** socket disconnects, they are removed from any active conference rooms they were in. The room is deleted from the SFU and `conference_ended` is broadcast when the last participant leaves.

### Multi-device Support

A user joining a conference from multiple devices counts as a single participant. Leaving from one device while another remains active is a no-op — the participant stays in the call until their last device disconnects or explicitly leaves.

### Conference Error Messages

| Error                              | Cause                                                  |
| ---------------------------------- | ------------------------------------------------------ |
| `"Not authenticated"`              | Client has not completed authentication                |
| `"Not a member of this group"`     | The user is not a member of the group                  |
| `"Failed to verify group membership"` | Cache error during membership check                 |
| `"Failed to create conference room"` | SFU room creation failed                             |
| `"Failed to generate access token"` | SFU token generation failed                          |

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

```text
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

| Event                          | Payload                                                                     | Requires Auth | Plugin   |
| ------------------------------ | --------------------------------------------------------------------------- | ------------- | -------- |
| `authenticate`                 | `{ token: string }`                                                         | No            | Auth     |
| `get_online_status`            | `{ userIds: string[] }`                                                     | No            | Presence |
| `send_message`                 | `{ to: string, content: string, metadata?: object }`                        | Yes           | Message |
| `typing_start`                 | `{ to: string }`                                                            | Yes           | Message |
| `typing_stop`                  | `{ to: string }`                                                            | Yes           | Message |
| `group_create`                 | `{ name: string, members?: string[], metadata?: object }`                   | Yes           | Group   |
| `group_join`                   | `{ groupId: string }`                                                       | Yes           | Group   |
| `group_leave`                  | `{ groupId: string }`                                                       | Yes           | Group   |
| `group_send_message`           | `{ groupId: string, content: string, metadata?: object }`                   | Yes           | Group   |
| `group_message_read`           | `{ groupId: string, messageId: string }`                                    | Yes           | Group   |
| `group_typing_start`           | `{ groupId: string }`                                                       | Yes           | Group   |
| `group_typing_stop`            | `{ groupId: string }`                                                       | Yes           | Group   |
| `get_group_members`            | `{ groupId: string }`                                                       | Yes           | Group   |
| `get_user_groups`              | `{}`                                                                        | Yes           | Group   |
| `get_group_message_history`    | `{ groupId: string, limit?: number, before?: number }`                      | Yes           | Group   |
| `call_get_ice_servers`         | `{}`                                                                        | Yes           | Voice      |
| `call_initiate`                | `{ to: string, sdpOffer: string }`                                          | Yes           | Voice      |
| `call_answer`                  | `{ callId: string, sdpAnswer: string }`                                     | Yes           | Voice      |
| `call_reject`                  | `{ callId: string }`                                                        | Yes           | Voice      |
| `call_hangup`                  | `{ callId: string }`                                                        | Yes           | Voice      |
| `call_ice_candidate`           | `{ callId: string, candidate: IceCandidateInit }`                           | Yes           | Voice      |
| `conference_join`              | `{ groupId: string }`                                                       | Yes           | Conference |
| `conference_leave`             | `{ groupId: string }`                                                       | Yes           | Conference |

### Server → Client

| Event                    | Payload                                                                                      | Recipient       | Plugin   |
| ------------------------ | -------------------------------------------------------------------------------------------- | --------------- | -------- |
| `authenticated`          | `{ userId: string, socketId: string }`                                                       | Sender          | Auth     |
| `auth_error`             | `{ message: string }`                                                                        | Sender          | Auth     |
| `user_online`            | `{ userId: string }`                                                                         | All clients     | Presence |
| `user_offline`           | `{ userId: string }`                                                                         | All clients     | Presence |
| `online_status`          | `{ statuses: Record<string, boolean> }`                                                      | Sender          | Presence |
| `receive_message`        | `{ from: string, content: string, timestamp: number, messageId: string, metadata?: object }` | Recipient       | Message  |
| `message_delivered`      | `{ messageId: string }`                                                                      | Sender          | Message  |
| `message_error`          | `{ messageId?: string, error: string }`                                                      | Sender          | Message  |
| `typing_start`           | `{ from: string }`                                                                           | Recipient       | Message  |
| `typing_stop`            | `{ from: string }`                                                                           | Recipient       | Message  |
| `group_created`          | `{ group: Group }`                                                                           | Sender          | Group    |
| `group_create_error`     | `{ error: string }`                                                                          | Sender          | Group    |
| `group_joined`           | `{ groupId: string, group: Group, queuedMessages: PersistedMessage[] }`                      | Sender          | Group    |
| `group_join_error`       | `{ groupId: string, error: string }`                                                         | Sender          | Group    |
| `group_member_joined`    | `{ groupId: string, member: GroupMember }`                                                   | Room (others)   | Group    |
| `group_left`             | `{ groupId: string }`                                                                        | Sender          | Group    |
| `group_member_left`      | `{ groupId: string, userId: string }`                                                        | Room (all)      | Group    |
| `group_receive_message`  | `{ groupId: string, messageId: string, from: string, content: string, timestamp: number, metadata?: object }` | Room (all) | Group |
| `group_message_delivered`| `{ groupId: string, messageId: string }`                                                     | Sender          | Group    |
| `group_message_error`    | `{ groupId: string, messageId?: string, error: string }`                                     | Sender          | Group    |
| `group_message_read`     | `{ groupId: string, messageId: string }`                                                     | Room (others)   | Group    |
| `group_typing_start`     | `{ groupId: string, from: string }`                                                          | Room (others)   | Group    |
| `group_typing_stop`      | `{ groupId: string, from: string }`                                                          | Room (others)   | Group    |
| `group_members`          | `{ groupId: string, members: GroupMember[] }`                                                | Sender          | Group    |
| `user_groups`            | `{ groups: Group[] }`                                                                        | Sender          | Group    |
| `group_message_history`  | `{ groupId: string, messages: PersistedMessage[] }`                                          | Sender          | Group    |
| `call_ice_servers`               | `{ iceServers: IceServer[] }`                                                                        | Sender             | Voice      |
| `call_ringing`                   | `{ callId: string }`                                                                                 | Caller             | Voice      |
| `call_incoming`                  | `{ callId: string, from: string, sdpOffer: string, iceServers: IceServer[] }`                        | All callee devices | Voice      |
| `call_busy`                      | `{ callId: string }`                                                                                 | Caller             | Voice      |
| `call_answered`                  | `{ callId: string, sdpAnswer: string }`                                                              | All caller devices | Voice      |
| `call_rejected`                  | `{ callId: string }`                                                                                 | All caller devices | Voice      |
| `call_ended`                     | `{ callId: string }`                                                                                 | Other party        | Voice      |
| `call_ice_candidate`             | `{ callId: string, candidate: IceCandidateInit }`                                                    | Other party        | Voice      |
| `conference_token`               | `{ groupId: string, sfuUrl: string, token: string }`                                                 | Joining client     | Conference |
| `conference_started`             | `{ groupId: string, startedBy: string, participantCount: number }`                                   | Group room         | Conference |
| `conference_ended`               | `{ groupId: string }`                                                                                | Group room         | Conference |
| `conference_participant_joined`  | `{ groupId: string, userId: string, participantCount: number }`                                      | Group room         | Conference |
| `conference_participant_left`    | `{ groupId: string, userId: string, participantCount: number }`                                      | Group room         | Conference |
| `conference_error`               | `{ groupId: string, error: string }`                                                                 | Joining client     | Conference |

---

## Error Handling

### Authentication Errors

| Scenario                        | Event        | Payload                                       | Socket Disconnected |
| ------------------------------- | ------------ | --------------------------------------------- | ------------------- |
| `AuthHandler` returns `null`    | `auth_error` | `{ message: "Invalid authentication token" }` | Yes                 |
| `AuthHandler` throws an error   | `auth_error` | `{ message: "Authentication failed" }`        | Yes                 |

### Direct Message Errors

| Scenario                   | Event           | Payload                                                   |
| -------------------------- | --------------- | --------------------------------------------------------- |
| Sender not authenticated   | `message_error` | `{ error: "Not authenticated" }`                          |
| Sender user ID unresolved  | `message_error` | `{ error: "Invalid user" }`                               |
| Recipient is offline       | `message_error` | `{ messageId: string, error: "Recipient is offline" }`    |

### Group Messaging Errors

| Scenario                         | Event                 | Payload                                           |
| -------------------------------- | --------------------- | ------------------------------------------------- |
| Not authenticated (create)       | `group_create_error`  | `{ error: "Not authenticated" }`                  |
| Store failure (create)           | `group_create_error`  | `{ error: "Failed to create group" }`             |
| Not authenticated (join)         | `group_join_error`    | `{ groupId: string, error: "Not authenticated" }` |
| Group not found (join)           | `group_join_error`    | `{ groupId: string, error: "Group not found" }`   |
| Store failure (join)             | `group_join_error`    | `{ groupId: string, error: "Failed to join group" }` |
| Not authenticated (send)         | `group_message_error` | `{ groupId: string, error: "Not authenticated" }` |
| Sender not a member              | `group_message_error` | `{ groupId: string, error: "Not a member of this group" }` |
| Store failure (send)             | `group_message_error` | `{ groupId: string, messageId: string, error: "Failed to save message" }` |

### Conference Errors

| Scenario                         | Event               | Payload                                                             |
| -------------------------------- | ------------------- | ------------------------------------------------------------------- |
| Not authenticated                | `conference_error`  | `{ groupId: string, error: "Not authenticated" }`                   |
| Not a group member               | `conference_error`  | `{ groupId: string, error: "Not a member of this group" }`          |
| Cache failure (membership check) | `conference_error`  | `{ groupId: string, error: "Failed to verify group membership" }`   |
| SFU room creation failed         | `conference_error`  | `{ groupId: string, error: "Failed to create conference room" }`    |
| SFU token generation failed      | `conference_error`  | `{ groupId: string, error: "Failed to generate access token" }`     |

### Typing Indicator Errors

Typing indicators (both direct and group) **fail silently**. No error event is emitted if the sender is not authenticated or the recipient/group is unreachable.

### Initialization Errors

| Scenario                                                                        | Error                                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Calling `useAuth`/`usePresence`/`useMessaging` before `attach`/`createStandalone` | `"Socket.IO server not initialized"`                                             |
| Calling `attach`/`createStandalone` twice                                       | `"Socket.IO server already initialized"`                                           |
| Calling `initialize()` before `attach`/`createStandalone`                       | `"Socket.IO server not initialized. Call attach() or createStandalone() first."` |

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
