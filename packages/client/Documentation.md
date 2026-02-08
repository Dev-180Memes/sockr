# SOCKR Client SDK — Documentation

Complete reference for the `sockr-client` package.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
  - [With React](#with-react)
  - [Without React](#without-react)
- [Client Configuration](#client-configuration)
- [SocketClient](#socketclient)
  - [Connection](#connection)
  - [Authentication](#authentication)
  - [Messaging](#messaging)
  - [Presence](#presence)
  - [Typing Indicators](#typing-indicators)
  - [Event Subscription](#event-subscription)
  - [Connection State](#connection-state)
- [React Integration](#react-integration)
  - [SocketProvider](#socketprovider)
  - [useSocket](#usesocket)
  - [useSocketEvent](#usesocketevent)
  - [useMessages](#usemessages)
  - [useSendMessage](#usesendmessage)
  - [usePresence](#usepresence)
  - [useTypingIndicator](#usetypingindicator)
- [Core Classes](#core-classes)
  - [ConnectionManager](#connectionmanager)
  - [EventEmitter](#eventemitter)
- [Connection Lifecycle](#connection-lifecycle)
- [Reconnection](#reconnection)
- [Socket Events Reference](#socket-events-reference)
- [Error Handling](#error-handling)
- [Full Examples](#full-examples)

---

## Installation

```bash
npm install sockr-client
```

`sockr-shared` is installed as a dependency. All shared types (`SocketEvent`, `ClientConfig`, `EventPayloads`, etc.) are re-exported from `sockr-client` so you can import everything from a single package.

```typescript
import { SocketClient, SocketEvent, ClientConfig, ConnectionState } from "sockr-client";
```

> For the full shared types reference, see the [sockr-shared Documentation](../shared/Documentation.md).

**Peer dependency:** React 18+ is required for the React hooks. The core `SocketClient` class works without React.

---

## Quick Start

### With React

```tsx
import { SocketProvider, useSocket, useMessages, useSendMessage } from "sockr-client";

function App() {
  return (
    <SocketProvider
      config={{ url: "http://localhost:3000" }}
      token="my-auth-token"
    >
      <Chat />
    </SocketProvider>
  );
}

function Chat() {
  const { isConnected, isAuthenticated } = useSocket();
  const { messages } = useMessages();
  const { sendMessage, isSending } = useSendMessage();

  if (!isConnected) return <p>Connecting...</p>;
  if (!isAuthenticated) return <p>Authenticating...</p>;

  return (
    <div>
      {messages.map((msg) => (
        <p key={msg.id}>
          <strong>{msg.from}:</strong> {msg.content}
        </p>
      ))}
      <button
        disabled={isSending}
        onClick={() => sendMessage("recipient-id", "Hello!")}
      >
        Send
      </button>
    </div>
  );
}
```

### Without React

```typescript
import { SocketClient } from "sockr-client";

const client = new SocketClient({
  url: "http://localhost:3000",
  reconnection: true,
  reconnectionAttempts: 5,
});

client.onStateChange((state) => {
  console.log("Connection state:", state);
});

client.on("authenticated", ({ userId }) => {
  console.log("Logged in as", userId);
  client.sendMessage("bob", "Hey Bob!");
});

client.on("message", ({ from, content }) => {
  console.log(`${from}: ${content}`);
});

client.connect();
client.authenticate("my-auth-token");
```

---

## Client Configuration

Pass a `ClientConfig` object to `SocketClient` or `SocketProvider` to customize the connection.

```typescript
const config: ClientConfig = {
  url: "http://localhost:3000",
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  transports: ["websocket", "polling"],
};
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | `string` | _(required)_ | The WebSocket server URL |
| `autoConnect` | `boolean` | `true` | Connect automatically when `SocketClient` is created |
| `reconnection` | `boolean` | `true` | Automatically reconnect on unexpected disconnect |
| `reconnectionAttempts` | `number` | `5` | Maximum number of reconnection attempts |
| `reconnectionDelay` | `number` | `1000` | Base delay in ms between reconnection attempts |
| `timeout` | `number` | `20000` | Connection timeout in ms |
| `transports` | `("websocket" \| "polling")[]` | `["websocket", "polling"]` | Allowed transport methods |

---

## SocketClient

The main client class that orchestrates WebSocket connection, authentication, and messaging.

```typescript
import { SocketClient } from "sockr-client";

const client = new SocketClient({ url: "http://localhost:3000" });
```

### Connection

#### `connect()`

Establishes the WebSocket connection. Called automatically if `autoConnect` is `true`.

```typescript
client.connect();
```

Throws an error if already connected.

#### `disconnect()`

Gracefully closes the connection, cancels pending reconnection timers, and resets internal state.

```typescript
client.disconnect();
```

### Authentication

#### `authenticate(token)`

Sends an authentication token to the server. The server validates the token and responds with either an `authenticated` or `auth_error` event.

```typescript
client.authenticate("my-auth-token");
```

Throws an error if not connected.

#### How It Works

1. Client calls `authenticate(token)`.
2. An `authenticate` event is emitted to the server with `{ token }`.
3. **If the server accepts:**
   - The client receives an `authenticated` event with `{ userId, socketId }`.
   - Connection state transitions to `AUTHENTICATED`.
   - The user ID is stored and accessible via `getUserId()`.
4. **If the server rejects:**
   - The client receives an `auth_error` event with `{ message }`.
   - Connection state transitions to `ERROR`.

```typescript
client.on("authenticated", ({ userId, socketId }) => {
  console.log("Authenticated as", userId);
});

client.on("auth_error", ({ message }) => {
  console.error("Auth failed:", message);
});
```

### Messaging

#### `sendMessage(to, content, metadata?)`

Sends a direct message to another authenticated user.

```typescript
client.sendMessage("recipient-id", "Hello!", { type: "text" });
```

| Parameter | Type | Description |
| --- | --- | --- |
| `to` | `string` | Recipient user ID |
| `content` | `string` | Message content |
| `metadata` | `Record<string, any>` | Optional metadata |

Throws an error if not authenticated.

#### Receiving Messages

```typescript
client.on("message", (data) => {
  console.log(data);
  // {
  //   from: "sender-id",
  //   content: "Hello!",
  //   timestamp: 1707300000000,
  //   messageId: "550e8400-e29b-41d4-a716-446655440000",
  //   metadata: { type: "text" }
  // }
});
```

#### Delivery Confirmation

```typescript
client.on("message_delivered", ({ messageId }) => {
  console.log("Delivered:", messageId);
});
```

#### Message Errors

```typescript
client.on("message_error", ({ messageId, error }) => {
  console.error("Failed:", error);
});
```

Possible error messages:

| Error | Cause |
| --- | --- |
| `"Not authenticated"` | Sender has not completed authentication |
| `"Invalid user"` | Sender's user ID could not be resolved |
| `"Recipient is offline"` | The recipient is not connected |

### Presence

#### `getOnlineStatus(userIds)`

Requests the online status of a list of users. The server responds with an `online_status` event.

```typescript
client.getOnlineStatus(["user-1", "user-2", "user-3"]);

client.on("online_status", ({ statuses }) => {
  console.log(statuses);
  // { "user-1": true, "user-2": false, "user-3": true }
});
```

Throws an error if not connected.

#### Online/Offline Broadcasts

The server automatically broadcasts when users connect or disconnect:

```typescript
client.on("user_online", ({ userId }) => {
  console.log(userId, "is now online");
});

client.on("user_offline", ({ userId }) => {
  console.log(userId, "went offline");
});
```

### Typing Indicators

#### `startTyping(to)`

Notifies a user that you have started typing.

```typescript
client.startTyping("recipient-id");
```

#### `stopTyping(to)`

Clears the typing indicator for a user.

```typescript
client.stopTyping("recipient-id");
```

#### Receiving Typing Events

```typescript
client.on("typing_start", ({ from }) => {
  console.log(from, "is typing...");
});

client.on("typing_stop", ({ from }) => {
  console.log(from, "stopped typing");
});
```

### Event Subscription

#### `on(event, handler)`

Subscribe to any socket event. Returns a cleanup function to unsubscribe.

```typescript
const unsubscribe = client.on("custom-event", (data) => {
  console.log(data);
});

// Later:
unsubscribe();
```

#### `off(event, handler)`

Unsubscribe a specific handler from an event.

```typescript
client.off("custom-event", myHandler);
```

#### `onStateChange(listener)`

Listen to connection state transitions. Returns a cleanup function.

```typescript
const unsubscribe = client.onStateChange((state) => {
  console.log("State changed to:", state);
});
```

### Connection State

#### `isConnected()`

Returns `true` if the connection state is `CONNECTED` or `AUTHENTICATED`.

#### `isAuthenticated()`

Returns `true` if the connection state is `AUTHENTICATED`.

#### `getConnectionState()`

Returns the current `ConnectionState` enum value.

#### `getUserId()`

Returns the authenticated user ID, or `null` if not authenticated.

#### `ConnectionState` Enum

```typescript
import { ConnectionState } from "sockr-client";

ConnectionState.DISCONNECTED   // "disconnected"
ConnectionState.CONNECTING     // "connecting"
ConnectionState.CONNECTED      // "connected"
ConnectionState.AUTHENTICATED  // "authenticated"
ConnectionState.ERROR          // "error"
ConnectionState.RECONNECTING   // "reconnecting"
```

---

## React Integration

All React features are provided through the `SocketProvider` context and a set of hooks.

### SocketProvider

Wraps your application with socket context. Creates a `SocketClient` internally, manages its lifecycle, and syncs connection state to React.

```tsx
import { SocketProvider } from "sockr-client";

function App() {
  return (
    <SocketProvider
      config={{ url: "http://localhost:3000" }}
      token="my-auth-token"
    >
      {children}
    </SocketProvider>
  );
}
```

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `config` | `ClientConfig` | Yes | Connection configuration |
| `token` | `string` | No | Auth token — auto-authenticates when the connection is established |
| `children` | `React.ReactNode` | Yes | Child components |

**Behavior:**

- Creates a `SocketClient` on mount and disconnects on unmount.
- If `token` is provided, automatically calls `authenticate(token)` once connected.
- All connection state (`isConnected`, `isAuthenticated`, `connectionState`, `userId`) is synced to React state.

### useSocket

Convenience hook to access the socket context. Returns the same value as `useSocketContext()`.

```typescript
import { useSocket } from "sockr-client";

function MyComponent() {
  const {
    client,           // SocketClient | null
    isConnected,      // boolean
    isAuthenticated,  // boolean
    connectionState,  // ConnectionState
    userId,           // string | null
  } = useSocket();

  if (!isConnected) return <p>Connecting...</p>;
  return <p>Connected as {userId}</p>;
}
```

Throws an error if used outside of `<SocketProvider>`.

### useSocketEvent

Subscribe to a socket event within the React lifecycle. Automatically cleans up on unmount and re-subscribes when dependencies change.

```typescript
import { useSocketEvent } from "sockr-client";

function Notifications() {
  useSocketEvent("user_online", (data) => {
    showNotification(`${data.userId} is online`);
  }, []);

  return null;
}
```

| Parameter | Type | Description |
| --- | --- | --- |
| `event` | `string` | The event name to listen to |
| `handler` | `(...args: any[]) => void` | Event handler callback |
| `deps` | `React.DependencyList` | Optional dependency array for re-subscription |

### useMessages

Manages incoming messages with automatic subscription to the `message` event.

```typescript
import { useMessages } from "sockr-client";

function MessageList() {
  const {
    messages,       // Message[]
    addMessage,     // (message: Message) => void
    clearMessages,  // () => void
  } = useMessages();

  return (
    <ul>
      {messages.map((msg) => (
        <li key={msg.id}>
          <strong>{msg.from}:</strong> {msg.content}
        </li>
      ))}
    </ul>
  );
}
```

#### `Message` Type

```typescript
interface Message {
  id: string;
  from: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}
```

**Behavior:**

- Automatically listens to `message` events and appends to the messages array.
- `addMessage()` allows manually inserting messages (e.g., optimistic updates for sent messages).
- `clearMessages()` resets the messages array.

### useSendMessage

Sends messages with loading and error state management.

```typescript
import { useSendMessage } from "sockr-client";

function SendButton() {
  const {
    sendMessage,  // (to: string, content: string, metadata?: Record<string, any>) => void
    isSending,    // boolean
    error,        // string | null
  } = useSendMessage();

  return (
    <div>
      <button
        disabled={isSending}
        onClick={() => sendMessage("bob", "Hello!")}
      >
        {isSending ? "Sending..." : "Send"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
```

**Behavior:**

- Sets `isSending` to `true` when a message is sent.
- Listens for `message_delivered` to reset `isSending` and clear errors.
- Listens for `message_error` to set the `error` string and reset `isSending`.
- Throws `"Not authenticated"` if the client is not authenticated.

### usePresence

Tracks which users are online with real-time updates.

```typescript
import { usePresence } from "sockr-client";

function OnlineUsers() {
  const {
    onlineUsers,       // Set<string>
    isUserOnline,      // (userId: string) => boolean
    checkOnlineStatus, // (userIds: string[]) => void
  } = usePresence();

  useEffect(() => {
    checkOnlineStatus(["alice", "bob", "charlie"]);
  }, []);

  return (
    <div>
      <p>Online: {onlineUsers.size} users</p>
      <p>Alice is {isUserOnline("alice") ? "online" : "offline"}</p>
    </div>
  );
}
```

**Behavior:**

- Listens to `user_online` and `user_offline` events to maintain the `onlineUsers` set.
- Responds to `online_status` batch results and merges them into the set.
- `isUserOnline()` provides O(1) lookup.
- `checkOnlineStatus()` sends a batch request to the server.

### useTypingIndicator

Manages typing indicators with automatic timeout.

```typescript
import { useTypingIndicator } from "sockr-client";

function TypingStatus() {
  const {
    startTyping,  // (to: string) => void
    stopTyping,   // (to: string) => void
    usersTyping,  // Set<string>
  } = useTypingIndicator(3000); // 3 second timeout

  return (
    <div>
      <input
        onFocus={() => startTyping("bob")}
        onBlur={() => stopTyping("bob")}
      />
      {usersTyping.size > 0 && (
        <p>{Array.from(usersTyping).join(", ")} typing...</p>
      )}
    </div>
  );
}
```

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `typingTimeout` | `number` | `3000` | Auto-remove typing indicator after this many ms |

**Behavior:**

- `startTyping(to)` emits a `typing_start` event to the server.
- `stopTyping(to)` emits a `typing_stop` event to the server.
- Listens to incoming `typing_start` and `typing_stop` events to track `usersTyping`.
- Automatically removes users from `usersTyping` after the timeout if no `typing_stop` event is received.
- Cleans up all timers on unmount.

---

## Core Classes

### ConnectionManager

Manages WebSocket connection state transitions and reconnection logic. Used internally by `SocketClient`.

```typescript
import { ConnectionManager, ConnectionState } from "sockr-client";

const manager = new ConnectionManager(5); // max 5 reconnect attempts
```

#### Constructor

```typescript
new ConnectionManager(maxReconnectAttempts?: number)
```

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `maxReconnectAttempts` | `number` | `5` | Maximum reconnection attempts before giving up |

#### Methods

| Method | Returns | Description |
| --- | --- | --- |
| `getState()` | `ConnectionState` | Get the current state |
| `setState(state)` | `void` | Set state and notify listeners |
| `isConnected()` | `boolean` | `true` if `CONNECTED` or `AUTHENTICATED` |
| `isAuthenticated()` | `boolean` | `true` if `AUTHENTICATED` |
| `onStateChange(listener)` | `() => void` | Listen to state changes (returns cleanup) |
| `incrementReconnectAttempts()` | `number` | Increment and return attempt count |
| `resetReconnectAttempts()` | `void` | Reset attempt count to 0 |
| `getReconnectAttempts()` | `number` | Get current attempt count |
| `canReconnect()` | `boolean` | `true` if under max attempts |
| `reset()` | `void` | Reset all state and clear listeners |

### EventEmitter

A lightweight event emitter for managing custom events. Used internally by `SocketClient`.

```typescript
import { EventEmitter } from "sockr-client";

const emitter = new EventEmitter();

const unsubscribe = emitter.on("my-event", (data) => {
  console.log(data);
});

emitter.emit("my-event", { hello: "world" });
unsubscribe();
```

#### Methods

| Method | Returns | Description |
| --- | --- | --- |
| `on(event, handler)` | `() => void` | Register handler (returns cleanup) |
| `off(event, handler)` | `void` | Remove specific handler |
| `emit(event, ...args)` | `void` | Trigger all handlers for an event |
| `removeAllListeners(event?)` | `void` | Remove handlers for one or all events |

**Error handling:** If a handler throws an error, it is logged to the console and does not prevent other handlers from running.

---

## Connection Lifecycle

```text
new SocketClient(config)
  ├─ autoConnect: true → connect() called automatically
  └─ autoConnect: false → waiting for manual connect()

connect()
  -> State: CONNECTING
  -> WebSocket established
  -> State: CONNECTED
  -> authenticate(token)
  -> Server validates token
  -> State: AUTHENTICATED
  -> Client can now send messages, check presence, etc.

Unexpected disconnect (server down, network loss)
  -> State: RECONNECTING
  -> Attempt 1: wait reconnectionDelay * 1
  -> Attempt 2: wait reconnectionDelay * 2
  -> ...
  -> Attempt N: wait reconnectionDelay * N
  -> Reconnected -> State: CONNECTED
  -> OR max attempts exceeded -> State: DISCONNECTED

Intentional disconnect()
  -> State: DISCONNECTED
  -> No reconnection attempted
  -> All timers cleared
```

---

## Reconnection

When the connection drops unexpectedly (not via `disconnect()`), the client automatically attempts to reconnect using exponential backoff.

### How It Works

1. Connection is lost — state transitions to `RECONNECTING`.
2. The client waits `reconnectionDelay * attemptNumber` milliseconds.
3. A reconnection is attempted.
4. If successful, state transitions to `CONNECTED`.
5. If failed, step 2–4 repeats up to `reconnectionAttempts` times.
6. If all attempts fail, state transitions to `DISCONNECTED`.

### Configuration

```typescript
const client = new SocketClient({
  url: "http://localhost:3000",
  reconnection: true,       // Enable/disable (default: true)
  reconnectionAttempts: 5,   // Max attempts (default: 5)
  reconnectionDelay: 1000,   // Base delay in ms (default: 1000)
});
```

### Backoff Schedule (with default 1000ms delay)

| Attempt | Delay |
| --- | --- |
| 1 | 1000ms |
| 2 | 2000ms |
| 3 | 3000ms |
| 4 | 4000ms |
| 5 | 5000ms |

### Intentional Disconnect

Calling `disconnect()` cancels any pending reconnection and prevents future reconnection attempts.

---

## Socket Events Reference

### Listened Events (Server -> Client)

| Event | Payload | Description |
| --- | --- | --- |
| `connect` | _(none)_ | WebSocket connection established |
| `disconnect` | _(none)_ | WebSocket connection lost |
| `connect_error` | `Error` | Connection error occurred |
| `authenticated` | `{ userId: string, socketId: string }` | Authentication succeeded |
| `auth_error` | `{ message: string }` | Authentication failed |
| `user_online` | `{ userId: string }` | A user came online |
| `user_offline` | `{ userId: string }` | A user went offline |
| `online_status` | `{ statuses: Record<string, boolean> }` | Batch online status response |
| `message` | `{ from, content, timestamp, messageId, metadata? }` | Direct message received |
| `message_delivered` | `{ messageId: string }` | Message delivery confirmed |
| `message_error` | `{ messageId?: string, error: string }` | Message delivery failed |
| `typing_start` | `{ from: string }` | A user started typing |
| `typing_stop` | `{ from: string }` | A user stopped typing |

### Emitted Events (Client -> Server)

| Event | Payload | Requires Auth | Description |
| --- | --- | --- | --- |
| `authenticate` | `{ token: string }` | No | Authenticate with the server |
| `get_online_status` | `{ userIds: string[] }` | No | Request batch online status |
| `send_message` | `{ to, content, metadata? }` | Yes | Send a direct message |
| `typing_start` | `{ to: string }` | Yes | Notify typing started |
| `typing_stop` | `{ to: string }` | Yes | Notify typing stopped |

---

## Error Handling

### Connection Errors

Connection errors are emitted via the `connect_error` event and cause a state transition to `ERROR`.

```typescript
client.on("connect_error", (error) => {
  console.error("Connection failed:", error);
});
```

If reconnection is enabled, the client will automatically attempt to reconnect after a connection error.

### Authentication Errors

| Scenario | Event | Payload | State |
| --- | --- | --- | --- |
| Server rejects token | `auth_error` | `{ message: "Invalid authentication token" }` | `ERROR` |
| Server handler throws | `auth_error` | `{ message: "Authentication failed" }` | `ERROR` |

### Message Errors

| Scenario | Event | Payload |
| --- | --- | --- |
| Not authenticated | _throws_ | `"Not authenticated"` |
| Recipient offline | `message_error` | `{ messageId, error: "Recipient is offline" }` |
| Invalid user | `message_error` | `{ error: "Invalid user" }` |

### Method Preconditions

| Method | Precondition | Error |
| --- | --- | --- |
| `connect()` | Not already connected | Throws if already connected |
| `authenticate(token)` | Must be connected | Throws if not connected |
| `sendMessage(to, content)` | Must be authenticated | Throws if not authenticated |
| `getOnlineStatus(userIds)` | Must be connected | Throws if not connected |

---

## Full Examples

### React Chat Application

```tsx
import React, { useState } from "react";
import {
  SocketProvider,
  useSocket,
  useMessages,
  useSendMessage,
  usePresence,
  useTypingIndicator,
} from "sockr-client";

function App() {
  return (
    <SocketProvider
      config={{
        url: "http://localhost:3000",
        transports: ["websocket"],
      }}
      token="my-auth-token"
    >
      <ChatApp />
    </SocketProvider>
  );
}

function ChatApp() {
  const { isConnected, isAuthenticated, connectionState } = useSocket();

  if (!isConnected) return <p>State: {connectionState}</p>;
  if (!isAuthenticated) return <p>Authenticating...</p>;

  return <ChatRoom recipientId="bob" />;
}

function ChatRoom({ recipientId }: { recipientId: string }) {
  const [input, setInput] = useState("");
  const { messages } = useMessages();
  const { sendMessage, isSending, error } = useSendMessage();
  const { isUserOnline } = usePresence();
  const { startTyping, stopTyping, usersTyping } = useTypingIndicator();

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(recipientId, input);
    setInput("");
  };

  return (
    <div>
      <p>
        {recipientId} is {isUserOnline(recipientId) ? "online" : "offline"}
      </p>

      <div>
        {messages.map((msg) => (
          <div key={msg.id}>
            <strong>{msg.from}:</strong> {msg.content}
          </div>
        ))}
      </div>

      {usersTyping.has(recipientId) && <p>{recipientId} is typing...</p>}

      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          startTyping(recipientId);
        }}
        onBlur={() => stopTyping(recipientId)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
      />
      <button onClick={handleSend} disabled={isSending}>
        Send
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
```

### Vanilla TypeScript Client

```typescript
import { SocketClient, ConnectionState } from "sockr-client";

const client = new SocketClient({
  url: "http://localhost:3000",
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  transports: ["websocket"],
});

// Monitor connection state
client.onStateChange((state) => {
  console.log(`[${new Date().toISOString()}] State: ${state}`);

  if (state === ConnectionState.CONNECTED) {
    client.authenticate("my-auth-token");
  }
});

// Handle authentication
client.on("authenticated", ({ userId }) => {
  console.log("Authenticated as", userId);

  // Check who's online
  client.getOnlineStatus(["alice", "charlie"]);

  // Send a message
  client.sendMessage("alice", "Hey Alice!", { type: "greeting" });
});

client.on("auth_error", ({ message }) => {
  console.error("Auth failed:", message);
});

// Presence
client.on("user_online", ({ userId }) => {
  console.log(userId, "came online");
});

client.on("user_offline", ({ userId }) => {
  console.log(userId, "went offline");
});

client.on("online_status", ({ statuses }) => {
  for (const [userId, isOnline] of Object.entries(statuses)) {
    console.log(`${userId}: ${isOnline ? "online" : "offline"}`);
  }
});

// Messages
client.on("message", ({ from, content, timestamp, messageId }) => {
  console.log(`[${new Date(timestamp).toLocaleTimeString()}] ${from}: ${content}`);
});

client.on("message_delivered", ({ messageId }) => {
  console.log("Delivered:", messageId);
});

client.on("message_error", ({ error }) => {
  console.error("Message failed:", error);
});

// Typing
client.on("typing_start", ({ from }) => {
  console.log(from, "is typing...");
});

client.on("typing_stop", ({ from }) => {
  console.log(from, "stopped typing");
});

// Connect manually
client.connect();
```

### Connection State Monitor

```typescript
import { SocketClient, ConnectionState } from "sockr-client";

const client = new SocketClient({ url: "http://localhost:3000" });

const unsubscribe = client.onStateChange((state) => {
  switch (state) {
    case ConnectionState.CONNECTING:
      showSpinner();
      break;
    case ConnectionState.CONNECTED:
      hideSpinner();
      showLoginForm();
      break;
    case ConnectionState.AUTHENTICATED:
      hideLoginForm();
      showChatUI();
      break;
    case ConnectionState.RECONNECTING:
      showReconnectingBanner();
      break;
    case ConnectionState.DISCONNECTED:
      showDisconnectedScreen();
      break;
    case ConnectionState.ERROR:
      showErrorScreen();
      break;
  }
});

// Later, stop listening:
unsubscribe();
```
