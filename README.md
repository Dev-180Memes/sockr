# sockr

A real-time messaging framework built on WebSockets (Socket.IO) with optional WebRTC voice calling support.

## Packages

| Package | Description |
| --- | --- |
| [`sockr-server`](packages/server) | Plugin-based WebSocket server |
| [`sockr-client`](packages/client) | WebSocket client SDK with React hooks |
| [`sockr-shared`](packages/shared) | Shared TypeScript types and interfaces |

## Features

- **Authentication** — Token-based auth with a custom handler
- **Presence** — Online/offline broadcasts and batch status queries
- **Direct Messaging** — 1-to-1 messages with delivery confirmation and offline queuing
- **Group Messaging** — Multi-user group chats with membership, history, and typing indicators
- **Voice Calling** — WebRTC signaling with STUN/TURN support (media stays peer-to-peer)
- **Multi-device** — A single user ID can hold multiple sockets (tabs/devices) simultaneously
- **React Hooks** — `useSocket`, `useMessages`, `usePresence`, `useTypingIndicator`, `useVoiceCall`, and more
- **Plugin Architecture** — Extend with custom plugins or swap storage/queue providers

## Quick Start

### Server

```bash
npm install sockr-server
```

```typescript
import { SocketServer } from "sockr-server";

const server = new SocketServer({
  cors: { origin: "*" },
  voice: {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    turn: { urls: "turn:turn.example.com", secret: "my-secret", ttl: 3600 },
  },
})
  .createStandalone()
  .useAuth(async (token) => {
    const user = await validateToken(token);
    return user ? { id: user.id } : null;
  })
  .usePresence()
  .useMessaging()
  .useGroupMessaging()
  .useVoice();

await server.listen(3000);
```

### Client (React)

```bash
npm install sockr-client
```

```tsx
import { SocketProvider, useSocket, useMessages, useSendMessage, useVoiceCall } from "sockr-client";

function App() {
  return (
    <SocketProvider config={{ url: "http://localhost:3000" }} token="my-auth-token">
      <Chat />
    </SocketProvider>
  );
}

function Chat() {
  const { isAuthenticated } = useSocket();
  const { messages } = useMessages();
  const { sendMessage } = useSendMessage();
  const { callState, startCall, answerCall, hangUp } = useVoiceCall();

  if (!isAuthenticated) return <p>Connecting...</p>;

  return (
    <div>
      {messages.map((msg) => (
        <p key={msg.id}><strong>{msg.from}:</strong> {msg.content}</p>
      ))}
      <button onClick={() => sendMessage("bob", "Hello!")}>Send</button>
      <button onClick={() => startCall("bob")} disabled={callState !== "idle"}>Call Bob</button>
      {callState === "active" && <button onClick={hangUp}>Hang Up</button>}
    </div>
  );
}
```

## Documentation

- [Server Documentation](packages/server/Documentation.md)
- [Client Documentation](packages/client/Documentation.md)
- [Shared Types Documentation](packages/shared/Documentation.md)

## License

MIT
