# Coturn Reference Setup

This is a ready-to-run [Coturn](https://github.com/coturn/coturn) configuration for use with Sockr's voice calling feature. It is a **reference** — you bring the infrastructure, Sockr handles the credentials.

## What is Coturn?

Coturn is an open-source STUN/TURN server. You need it when peers are behind strict NATs or firewalls and cannot connect directly for WebRTC. Without TURN, roughly 15-20% of calls will fail in production.

## How Sockr integrates with it

You configure Sockr's server with your Coturn details. Sockr generates short-lived HMAC-SHA1 credentials per user at call time — the TURN secret **never** reaches the client.

```ts
const server = new SocketServer({
  voice: {
    // Optional: a public STUN server (always good to include)
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],

    // Your Coturn instance
    turn: {
      urls: 'turn:turn.yourapp.com:3478',
      secret: process.env.TURN_SECRET, // same value as static-auth-secret below
      ttl: 3600,                        // credential lifetime in seconds
    },
  },
});

server.useVoice();
```

The client needs nothing — `useVoiceCall()` receives ICE servers automatically through the socket.

## Running locally

```bash
# 1. Set your secret (use a real random value in production)
export TURN_SECRET=$(openssl rand -hex 32)

# 2. Edit turnserver.conf — set `realm` to your domain or `localhost` for dev
# 3. Start Coturn
docker compose up -d

# 4. Verify it's running
docker compose logs -f
```

## Production checklist

- [ ] Set `external-ip` in `turnserver.conf` to your server's public IP
- [ ] Set `realm` to your actual domain
- [ ] Generate a strong `TURN_SECRET` and store it securely (e.g. in a secrets manager)
- [ ] Open ports `3478/udp`, `3478/tcp`, and `49152-65535/udp` in your firewall
- [ ] Add TLS: obtain a certificate (e.g. Let's Encrypt), uncomment `cert`/`pkey` in the config, and use `turns:` URLs for `turn.urls`
- [ ] Match `credential-ttl` in `turnserver.conf` to `voice.turn.ttl` in your Sockr config

## When do you actually need TURN?

| Scenario | STUN enough? | TURN needed? |
|---|---|---|
| Both peers on the same LAN | Yes | No |
| One peer behind a home router | Usually | Sometimes |
| Corporate firewall / symmetric NAT | No | Yes |
| Mobile networks (carrier-grade NAT) | No | Yes |

A single small VM (1–2 vCPU, 1 GB RAM) handles hundreds of simultaneous relayed calls. TURN only relays audio when direct connection fails — most calls will stay P2P.
