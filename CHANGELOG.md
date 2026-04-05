# Changelog

## [Unreleased]

---

## v1.2.0 — sockr-server, sockr-client

### Added

- **Voice calling** (`useVoiceCall`, `VoicePlugin`) — WebRTC peer-to-peer voice and video calls with full ICE/TURN negotiation. Media never passes through the server; only SDP offers/answers and ICE candidates are relayed.
- **SFU-based group conference calling** (`useConferenceCall`, `ConferencePlugin`) — Multi-participant calls backed by a Selective Forwarding Unit (LiveKit by default). Requires `livekit-client` on the client and a LiveKit server configured via `ServerConfig.conference`.
- **Group messaging** (`useGroupMessages`, `GroupPlugin`) — Multi-user group chats with membership management, message history, offline queuing, and per-group typing indicators.
- **Multi-device support** — A single user ID can hold multiple simultaneous socket connections (browser tabs, devices). Messages and presence events fan out to all active sockets.
- **Custom SFU adapter interface** (`ISFUClientAdapter`) — Implement this interface to use any SFU in place of LiveKit.
- React hooks: `useGroup`, `useGroupMessages`, `useGroupTyping`, `useUserGroups`, `useVoiceCall`, `useConferenceCall`.

---

## v1.3.0 — sockr-shared only

> **Note:** `sockr-shared` is versioned independently. `sockr-server` and `sockr-client` both depend on `sockr-shared@^1.3.0`. If you depend on `sockr-shared` directly, upgrade to 1.3.0.

### Added

- `CallStatus`, `IceServer`, `IceCandidateInit`, `ActiveCall` types (used by voice calling).
- `ConferenceParticipant`, `ConferenceRoom` types (used by conference calling).
- Call and conference event payloads added to `SocketEvent` enum and `EventPayloads` map.
- `ISFUProvider`, `TokenOptions`, `RoomOptions` interfaces (server-side SFU abstraction).
- Group types: `Group`, `GroupMember`, `GroupMessage`, `GroupRole`.
- Provider interfaces: `IMessageStore`, `IQueueProvider`, `ICacheProvider`.

---

## v1.1.0 — sockr-server, sockr-client, sockr-shared

### Added

- Initial public release.
- Authentication (`useAuth`, `AuthPlugin`) — token-based auth with a custom handler.
- Presence tracking (`usePresence`, `PresencePlugin`) — online/offline broadcasts and batch status queries.
- Direct messaging (`useMessages`, `useSendMessage`, `MessagePlugin`) — 1-to-1 messages with delivery confirmation.
- Typing indicators (`useTypingIndicator`) — per-conversation typing state with auto-timeout.
- Core React hooks: `useSocket`, `useSocketEvent`, `useMessages`, `useSendMessage`, `usePresence`, `useTypingIndicator`.
- `SocketClient` class for use without React.
- `SocketProvider` React context component.
- Plugin architecture — extend `Plugin` to add custom server behavior.
- Support for standalone, `attach()`, and `attachToExpress()` server modes.
