# sockr-shared

Shared TypeScript type definitions for the [SOCKR](https://github.com/Dev-180Memes/sockr) WebSocket messaging framework. This package provides type-safe contracts used by both the server and client packages.

## Installation

```bash
npm install sockr-shared
```

## Overview

This package exports TypeScript interfaces, enums, and types that ensure consistent communication between SOCKR server and client implementations. It has **zero runtime dependencies** and ships with full TypeScript support (CommonJS, ES Modules, and `.d.ts` declarations).

## Exports

### Socket Events

The `SocketEvent` enum defines all events used in the messaging protocol:

```typescript
import { SocketEvent } from 'sockr-shared';

// Connection lifecycle
SocketEvent.CONNECT
SocketEvent.DISCONNECT
SocketEvent.ERROR

// Authentication
SocketEvent.AUTHENTICATE
SocketEvent.AUTHENTICATED
SocketEvent.AUTH_ERROR

// User presence
SocketEvent.USER_ONLINE
SocketEvent.USER_OFFLINE
SocketEvent.GET_ONLINE_STATUS
SocketEvent.ONLINE_STATUS

// Messaging
SocketEvent.SEND_MESSAGE
SocketEvent.RECEIVE_MESSAGE
SocketEvent.MESSAGE_DELIVERED
SocketEvent.MESSAGE_ERROR

// Typing indicators
SocketEvent.TYPING_START
SocketEvent.TYPING_STOP
```

### Event Payloads

The `EventPayloads` interface maps each event to its strictly-typed payload:

```typescript
import { EventPayloads, SocketEvent } from 'sockr-shared';

// Type-safe event handling
type AuthPayload = EventPayloads[SocketEvent.AUTHENTICATE];
// { token: string }

type MessagePayload = EventPayloads[SocketEvent.SEND_MESSAGE];
// { to: string; content: string; metadata?: Record<string, any> }
```

### Message Types

```typescript
import { Message, MessageOptions } from 'sockr-shared';

const message: Message = {
  id: 'msg-1',
  from: 'user-a',
  to: 'user-b',
  content: 'Hello!',
  timestamp: Date.now(),
  delivered: false,
  metadata: { priority: 'high' },
};

const options: MessageOptions = {
  requireAcknowledgment: true,
  timeout: 5000,
};
```

### User Types

```typescript
import { User, UserConnection } from 'sockr-shared';

const user: User = {
  id: 'user-a',
  socketId: 'socket-123',
  connectedAt: Date.now(),
};

const connection: UserConnection = {
  userId: 'user-a',
  socketId: 'socket-123',
  isOnline: true,
};
```

### Configuration Types

```typescript
import { ServerConfig, ClientConfig } from 'sockr-shared';

const serverConfig: ServerConfig = {
  port: 3000,
  cors: { origin: 'http://localhost:5173', credentials: true },
  pingTimeout: 10000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
};

const clientConfig: ClientConfig = {
  url: 'http://localhost:3000',
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
  transports: ['websocket'],
};
```

## Development

```bash
# Build the package
npm run build

# Watch mode
npm run dev

# Clean build artifacts
npm run clean
```

## License

MIT
