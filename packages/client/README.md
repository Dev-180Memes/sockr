# sockr-client

A WebSocket client SDK with React hooks for real-time messaging, authentication, presence tracking, and typing indicators. Built on [Socket.IO](https://socket.io) and designed to work with [sockr-server](../server).

## Installation

```bash
npm install sockr-client
```

**Optional peer dependency:** React 16.8+ is needed for the React hooks. The core `SocketClient` class works without React.

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

## API

### `SocketClient`

The core client class for managing WebSocket connections, authentication, and messaging.

#### Constructor

```typescript
new SocketClient(config: ClientConfig)
```

`ClientConfig` options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | `string` | _(required)_ | Server URL |
| `autoConnect` | `boolean` | `true` | Connect automatically on creation |
| `reconnection` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectionAttempts` | `number` | `5` | Max reconnection attempts |
| `reconnectionDelay` | `number` | `1000` | Base delay between attempts (ms) |
| `timeout` | `number` | `20000` | Connection timeout (ms) |
| `transports` | `string[]` | `["websocket", "polling"]` | Allowed transports |

#### Methods

| Method | Returns | Description |
| --- | --- | --- |
| `connect()` | `void` | Establish the WebSocket connection |
| `disconnect()` | `void` | Close the connection |
| `authenticate(token)` | `void` | Authenticate with the server |
| `sendMessage(to, content, metadata?)` | `void` | Send a direct message |
| `startTyping(to)` | `void` | Notify a user you are typing |
| `stopTyping(to)` | `void` | Clear typing indicator |
| `getOnlineStatus(userIds)` | `void` | Request online status for users |
| `isConnected()` | `boolean` | Check if connected |
| `isAuthenticated()` | `boolean` | Check if authenticated |
| `getConnectionState()` | `ConnectionState` | Get current connection state |
| `getUserId()` | `string \| null` | Get the authenticated user ID |
| `on(event, handler)` | `() => void` | Subscribe to events (returns cleanup) |
| `off(event, handler)` | `void` | Unsubscribe from events |
| `onStateChange(listener)` | `() => void` | Listen to state changes (returns cleanup) |

### React Components & Hooks

#### `<SocketProvider>`

Provides socket context to your React tree.

```tsx
<SocketProvider config={ClientConfig} token?: string>
  {children}
</SocketProvider>
```

| Prop | Type | Description |
| --- | --- | --- |
| `config` | `ClientConfig` | Connection configuration (required) |
| `token` | `string` | Auth token (auto-authenticates when connected) |

#### `useSocket()`

Access the socket client and connection state.

```typescript
const { client, isConnected, isAuthenticated, connectionState, userId } = useSocket();
```

#### `useMessages()`

Manage incoming messages.

```typescript
const { messages, addMessage, clearMessages } = useMessages();
```

#### `useSendMessage()`

Send messages with loading and error states.

```typescript
const { sendMessage, isSending, error } = useSendMessage();
```

#### `usePresence()`

Track which users are online.

```typescript
const { onlineUsers, isUserOnline, checkOnlineStatus } = usePresence();
```

#### `useTypingIndicator(timeout?)`

Manage typing indicators with auto-timeout.

```typescript
const { startTyping, stopTyping, usersTyping } = useTypingIndicator(3000);
```

#### `useSocketEvent(event, handler, deps?)`

Subscribe to any socket event within React lifecycle.

```typescript
useSocketEvent("custom-event", (data) => {
  console.log(data);
}, []);
```

### Connection States

```typescript
enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  AUTHENTICATED = "authenticated",
  ERROR = "error",
  RECONNECTING = "reconnecting",
}
```

## Connection Lifecycle

```text
SocketClient created (autoConnect: true)
  -> State: CONNECTING
  -> WebSocket established
  -> State: CONNECTED
  -> Client calls authenticate(token)
  -> Server validates token
  -> State: AUTHENTICATED
  -> Client can send/receive messages
  -> Connection lost
  -> State: RECONNECTING (exponential backoff)
  -> Reconnected -> State: CONNECTED
  -> Client disconnects
  -> State: DISCONNECTED
```

## Scripts

```bash
npm run dev     # Watch mode
npm run build   # Production build
npm run clean   # Remove dist/
```

## Documentation

See [Documentation.md](Documentation.md) for the full API reference.

## License

MIT
