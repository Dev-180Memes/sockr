# LiveKit reference setup

This directory provides a minimal LiveKit SFU setup for local development.

## Quick start

```bash
cd docker/livekit
docker compose up -d
```

The server starts on `ws://localhost:7880` with the default dev credentials `devkey` / `devsecret`.

## Connecting Sockr

### Server (sockr-server)

```ts
import { SocketServer } from 'sockr-server';
import { LiveKitSFUProvider } from 'sockr-server/adapters';

const server = new SocketServer();

server
  .useAuth(myAuthHandler)
  .useGroupMessaging()
  .useConference(
    new LiveKitSFUProvider({
      apiKey: process.env.LIVEKIT_API_KEY!,      // 'devkey' locally
      apiSecret: process.env.LIVEKIT_API_SECRET!, // 'devsecret' locally
      host: process.env.LIVEKIT_HOST!,            // 'http://localhost:7880' locally
    }),
    process.env.LIVEKIT_WS_URL!                   // 'ws://localhost:7880' locally
  );

await server.listen(3000);
```

The `apiSecret` never leaves your server. Sockr generates short-lived tokens
server-side and delivers them to clients via the `CONFERENCE_TOKEN` socket event.

### Client (sockr-client)

```tsx
import { LiveKitClientAdapter, useConferenceCall } from 'sockr-client';

const adapter = new LiveKitClientAdapter(); // created once, outside the component

function ConferenceRoom({ groupId }: { groupId: string }) {
  const { conferenceState, participants, joinConference, leaveConference, onRemoteTrack } =
    useConferenceCall({ adapter, audio: true, video: false });

  // Attach remote audio tracks to <audio> elements
  onRemoteTrack((track, participantId) => {
    const el = document.getElementById(`audio-${participantId}`) as HTMLAudioElement;
    if (el) el.srcObject = new MediaStream([track]);
  });

  return (
    <div>
      <p>State: {conferenceState}</p>
      <button onClick={() => joinConference(groupId)}>Join</button>
      <button onClick={() => leaveConference()}>Leave</button>
      {participants.map((p) => (
        <audio key={p.userId} id={`audio-${p.userId}`} autoPlay />
      ))}
    </div>
  );
}
```

## Production checklist

1. Replace `devkey` / `devsecret` with strong random values.
2. Set `rtc.nat_ip` in `livekit.yaml` to your server's public IP.
3. Enable TLS termination in front of LiveKit (e.g. nginx or Caddy).
4. Set `LIVEKIT_WS_URL` to the public `wss://` URL when initialising the server.

## Environment variables

| Variable | Dev default | Description |
|---|---|---|
| `LIVEKIT_API_KEY` | `devkey` | API key — must match `livekit.yaml` `keys` section |
| `LIVEKIT_API_SECRET` | `devsecret` | API secret — keep this on the server only |
| `LIVEKIT_HOST` | `http://localhost:7880` | HTTP URL for `RoomServiceClient` (room management) |
| `LIVEKIT_WS_URL` | `ws://localhost:7880` | WebSocket URL sent to clients for media connection |
