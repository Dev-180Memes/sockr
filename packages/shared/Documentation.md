# SOCKR Shared — Documentation

Complete reference for the `sockr-shared` package — shared types, interfaces, and enums used across the SOCKR ecosystem.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Types](#types)
  - [User](#user)
  - [UserConnection](#userconnection)
  - [Message](#message)
  - [MessageOptions](#messageoptions)
  - [ServerConfig](#serverconfig)
  - [ClientConfig](#clientconfig)
- [SocketEvent Enum](#socketevent-enum)
- [EventPayloads](#eventpayloads)
  - [Authentication Payloads](#authentication-payloads)
  - [Presence Payloads](#presence-payloads)
  - [Messaging Payloads](#messaging-payloads)
  - [Typing Indicator Payloads](#typing-indicator-payloads)

---

## Installation

```bash
npm install sockr-shared
```

> If you are using `sockr-server`, you do **not** need to install this package separately — all exports are re-exported from `sockr-server`.

---

## Usage

Import any type, interface, or enum directly:

```typescript
import {
  SocketEvent,
  EventPayloads,
  User,
  UserConnection,
  Message,
  MessageOptions,
  ServerConfig,
  ClientConfig,
} from "sockr-shared";
```

Or from `sockr-server` if you already depend on it:

```typescript
import { SocketEvent, User, ServerConfig } from "sockr-server";
```

---

## Types

### `User`

Represents an authenticated user attached to a socket connection.

```typescript
interface User {
  id: string;
  socketId: string;
  connectedAt: number;
  metadata?: Record<string, any>;
}
```

| Field          | Type                  | Description                                                     |
| -------------- | --------------------- | --------------------------------------------------------------- |
| `id`           | `string`              | Unique user identifier. You provide this in your auth handler.  |
| `socketId`     | `string`              | The Socket.IO socket ID. Set automatically by the server.       |
| `connectedAt`  | `number`              | Unix timestamp (ms) of when the user authenticated. Set by server. |
| `metadata`     | `Record<string, any>` | Optional. Arbitrary data you can attach to the user.            |

**Example:**

```typescript
const user: User = {
  id: "user-123",
  socketId: "abc123",
  connectedAt: Date.now(),
  metadata: { role: "admin" },
};
```

---

### `UserConnection`

Describes a user's connection state. Useful for representing presence data.

```typescript
interface UserConnection {
  userId: string;
  socketId: string;
  isOnline: boolean;
}
```

| Field      | Type      | Description                    |
| ---------- | --------- | ------------------------------ |
| `userId`   | `string`  | The user's ID                  |
| `socketId` | `string`  | The Socket.IO socket ID       |
| `isOnline` | `boolean` | Whether the user is connected  |

**Example:**

```typescript
const connection: UserConnection = {
  userId: "user-123",
  socketId: "abc123",
  isOnline: true,
};
```

---

### `Message`

Represents a complete message with delivery status.

```typescript
interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  delivered: boolean;
  metadata?: Record<string, any>;
}
```

| Field       | Type                  | Description                                  |
| ----------- | --------------------- | -------------------------------------------- |
| `id`        | `string`              | Unique message ID (UUID)                     |
| `from`      | `string`              | Sender's user ID                             |
| `to`        | `string`              | Recipient's user ID                          |
| `content`   | `string`              | Message body                                 |
| `timestamp` | `number`              | Unix timestamp (ms) of when it was sent      |
| `delivered` | `boolean`             | Whether the message was delivered             |
| `metadata`  | `Record<string, any>` | Optional. Arbitrary data attached to the message. |

**Example:**

```typescript
const message: Message = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  from: "alice",
  to: "bob",
  content: "Hello!",
  timestamp: Date.now(),
  delivered: true,
  metadata: { type: "text" },
};
```

---

### `MessageOptions`

Options for controlling message delivery behavior.

```typescript
interface MessageOptions {
  requireAcknowledgment?: boolean;
  timeout?: number;
}
```

| Field                    | Type      | Description                                        |
| ------------------------ | --------- | -------------------------------------------------- |
| `requireAcknowledgment`  | `boolean` | Optional. Whether to require delivery confirmation |
| `timeout`                | `number`  | Optional. Timeout in milliseconds                  |

**Example:**

```typescript
const options: MessageOptions = {
  requireAcknowledgment: true,
  timeout: 5000,
};
```

---

### `ServerConfig`

Configuration for the SOCKR server.

```typescript
interface ServerConfig {
  port?: number;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  pingTimeout?: number;
  pingInterval?: number;
  transports?: ("websocket" | "polling")[];
}
```

| Field           | Type                               | Description                                   |
| --------------- | ---------------------------------- | --------------------------------------------- |
| `port`          | `number`                           | Optional. Server port number.                 |
| `cors`          | `object`                           | Optional. CORS configuration.                 |
| `cors.origin`   | `string \| string[]`              | Allowed origin(s).                            |
| `cors.credentials` | `boolean`                       | Optional. Whether to allow credentials.       |
| `pingTimeout`   | `number`                           | Optional. Ping timeout in milliseconds.       |
| `pingInterval`  | `number`                           | Optional. Ping interval in milliseconds.      |
| `transports`    | `("websocket" \| "polling")[]`     | Optional. Allowed transport methods.          |

**Example:**

```typescript
const config: ServerConfig = {
  cors: {
    origin: ["https://myapp.com", "https://admin.myapp.com"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket"],
};
```

---

### `ClientConfig`

Configuration for a SOCKR client connection.

```typescript
interface ClientConfig {
  url: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
  transports?: ("websocket" | "polling")[];
}
```

| Field                  | Type                           | Description                                    |
| ---------------------- | ------------------------------ | ---------------------------------------------- |
| `url`                  | `string`                       | **Required.** Server URL to connect to.        |
| `autoConnect`          | `boolean`                      | Optional. Connect immediately on creation.     |
| `reconnection`         | `boolean`                      | Optional. Enable automatic reconnection.       |
| `reconnectionAttempts` | `number`                       | Optional. Max number of reconnection attempts. |
| `reconnectionDelay`    | `number`                       | Optional. Delay (ms) between attempts.         |
| `timeout`              | `number`                       | Optional. Connection timeout in milliseconds.  |
| `transports`           | `("websocket" \| "polling")[]` | Optional. Allowed transport methods.           |

**Example:**

```typescript
const config: ClientConfig = {
  url: "http://localhost:3000",
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
  transports: ["websocket"],
};
```

---

## SocketEvent Enum

All event names used in the SOCKR protocol. Use these instead of raw strings for type safety.

```typescript
enum SocketEvent {
  // Connection
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  ERROR = "error",

  // Authentication
  AUTHENTICATE = "authenticate",
  AUTHENTICATED = "authenticated",
  AUTH_ERROR = "auth_error",

  // Presence
  USER_ONLINE = "user_online",
  USER_OFFLINE = "user_offline",
  GET_ONLINE_STATUS = "get_online_status",
  ONLINE_STATUS = "online_status",

  // Messaging
  SEND_MESSAGE = "send_message",
  RECEIVE_MESSAGE = "receive_message",
  MESSAGE_DELIVERED = "message_delivered",
  MESSAGE_ERROR = "message_error",
  TYPING_START = "typing_start",
  TYPING_STOP = "typing_stop",
}
```

### Connection Events

| Enum Value   | String Value   | Description                    |
| ------------ | -------------- | ------------------------------ |
| `CONNECT`    | `"connect"`    | Socket connected               |
| `DISCONNECT` | `"disconnect"` | Socket disconnected            |
| `ERROR`      | `"error"`      | General error                  |

### Authentication Events

| Enum Value      | String Value      | Direction        | Description                     |
| --------------- | ----------------- | ---------------- | ------------------------------- |
| `AUTHENTICATE`  | `"authenticate"`  | Client → Server  | Client sends auth token         |
| `AUTHENTICATED` | `"authenticated"` | Server → Client  | Auth succeeded                  |
| `AUTH_ERROR`    | `"auth_error"`    | Server → Client  | Auth failed                     |

### Presence Events

| Enum Value          | String Value          | Direction        | Description                           |
| ------------------- | --------------------- | ---------------- | ------------------------------------- |
| `USER_ONLINE`       | `"user_online"`       | Server → All     | A user came online                    |
| `USER_OFFLINE`      | `"user_offline"`      | Server → All     | A user went offline                   |
| `GET_ONLINE_STATUS` | `"get_online_status"` | Client → Server  | Request batch online status           |
| `ONLINE_STATUS`     | `"online_status"`     | Server → Client  | Response with online status map       |

### Messaging Events

| Enum Value          | String Value          | Direction        | Description                           |
| ------------------- | --------------------- | ---------------- | ------------------------------------- |
| `SEND_MESSAGE`      | `"send_message"`      | Client → Server  | Send a direct message                 |
| `RECEIVE_MESSAGE`   | `"receive_message"`   | Server → Client  | Deliver a message to recipient        |
| `MESSAGE_DELIVERED`  | `"message_delivered"` | Server → Client  | Confirm delivery to sender            |
| `MESSAGE_ERROR`     | `"message_error"`     | Server → Client  | Message could not be delivered        |
| `TYPING_START`      | `"typing_start"`      | Both             | User started typing                   |
| `TYPING_STOP`       | `"typing_stop"`       | Both             | User stopped typing                   |

**Usage:**

```typescript
import { SocketEvent } from "sockr-shared";

// Use enum values instead of raw strings
socket.emit(SocketEvent.AUTHENTICATE, { token: "my-token" });
socket.on(SocketEvent.AUTHENTICATED, (data) => { /* ... */ });
```

---

## EventPayloads

A type-safe mapping from each `SocketEvent` to its expected payload shape. Use this to enforce correct payloads at compile time.

```typescript
import { SocketEvent, EventPayloads } from "sockr-shared";

// Type a handler's parameter:
function handleAuth(payload: EventPayloads[SocketEvent.AUTHENTICATE]) {
  console.log(payload.token); // string — type-safe
}

// Type an event listener:
socket.on(SocketEvent.SEND_MESSAGE, (payload: EventPayloads[SocketEvent.SEND_MESSAGE]) => {
  console.log(payload.to);       // string
  console.log(payload.content);  // string
  console.log(payload.metadata); // Record<string, any> | undefined
});
```

### Authentication Payloads

#### `AUTHENTICATE` — Client → Server

```typescript
{
  token: string;
}
```

The token to validate. Sent by the client when initiating authentication.

#### `AUTHENTICATED` — Server → Client

```typescript
{
  userId: string;
  socketId: string;
}
```

Sent to the client after successful authentication.

#### `AUTH_ERROR` — Server → Client

```typescript
{
  message: string;
}
```

Sent to the client when authentication fails. Possible messages:
- `"Invalid authentication token"` — the auth handler returned `null`.
- `"Authentication failed"` — the auth handler threw an error.

---

### Presence Payloads

#### `USER_ONLINE` — Server → All Clients

```typescript
{
  userId: string;
}
```

Broadcast to all clients when a user authenticates.

#### `USER_OFFLINE` — Server → All Clients

```typescript
{
  userId: string;
}
```

Broadcast to all clients when an authenticated user disconnects.

#### `GET_ONLINE_STATUS` — Client → Server

```typescript
{
  userIds: string[];
}
```

Request to check the online status of a list of users.

#### `ONLINE_STATUS` — Server → Client

```typescript
{
  statuses: Record<string, boolean>;
}
```

Response mapping each requested user ID to their online status.

---

### Messaging Payloads

#### `SEND_MESSAGE` — Client → Server

```typescript
{
  to: string;
  content: string;
  metadata?: Record<string, any>;
}
```

Send a direct message to another user.

#### `RECEIVE_MESSAGE` — Server → Recipient

```typescript
{
  from: string;
  content: string;
  timestamp: number;
  messageId: string;
  metadata?: Record<string, any>;
}
```

Delivered to the recipient when they receive a message. `messageId` is a server-generated UUID. `timestamp` is `Date.now()` at time of processing.

#### `MESSAGE_DELIVERED` — Server → Sender

```typescript
{
  messageId: string;
}
```

Confirmation sent to the sender after the message was delivered to the recipient.

#### `MESSAGE_ERROR` — Server → Sender

```typescript
{
  messageId: string;
  error: string;
}
```

Sent to the sender when the message could not be delivered. Possible errors:
- `"Not authenticated"` — the sender has not authenticated.
- `"Invalid user"` — the sender's user ID could not be resolved.
- `"Recipient is offline"` — the recipient is not connected.

> Note: `messageId` may not be present for early failures (before UUID generation).

---

### Typing Indicator Payloads

#### `TYPING_START` — Client → Server

```typescript
{
  to: string;
}
```

Notify the server that you started typing to a specific user.

#### `TYPING_START` — Server → Recipient

```typescript
{
  from: string;
}
```

Forwarded to the recipient with the sender's user ID.

#### `TYPING_STOP` — Client → Server

```typescript
{
  to: string;
}
```

Notify the server that you stopped typing.

#### `TYPING_STOP` — Server → Recipient

```typescript
{
  from: string;
}
```

Forwarded to the recipient with the sender's user ID.

> Note: Typing indicators fail silently. If the sender is unauthenticated or the recipient is offline, the event is simply dropped.
