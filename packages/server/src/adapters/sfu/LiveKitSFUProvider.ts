import { ISFUProvider, TokenOptions, RoomOptions } from 'sockr-shared';

export interface LiveKitSFUProviderConfig {
  /** LiveKit API key (from livekit.yaml `keys` section). */
  apiKey: string;
  /** LiveKit API secret (from livekit.yaml `keys` section). */
  apiSecret: string;
  /** HTTP(S) URL of your LiveKit server, e.g. 'https://your-livekit.example.com'. */
  host: string;
  /** Pre-built RoomServiceClient — useful for testing. If supplied, `connect()` will not create one. */
  client?: any;
  /** Default token TTL in seconds. Defaults to 3600 (1 hour). */
  defaultTtl?: number;
}

/**
 * LiveKit implementation of ISFUProvider.
 *
 * Requires `livekit-server-sdk` to be installed in the consuming project:
 *   npm install livekit-server-sdk
 *
 * The SDK is loaded lazily at runtime — engineers who use a different SFU
 * are not affected by this dependency.
 *
 * @example
 * server.useConference(
 *   new LiveKitSFUProvider({
 *     apiKey: process.env.LIVEKIT_API_KEY!,
 *     apiSecret: process.env.LIVEKIT_API_SECRET!,
 *     host: 'https://your-livekit.example.com',
 *   }),
 *   'wss://your-livekit.example.com'
 * );
 */
export class LiveKitSFUProvider implements ISFUProvider {
  private config: LiveKitSFUProviderConfig;
  private roomService: any | null = null;
  private ownClient: boolean = true;

  constructor(config: LiveKitSFUProviderConfig) {
    this.config = config;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  public async connect(): Promise<void> {
    if (this.config.client) {
      this.roomService = this.config.client;
      this.ownClient = false;
      return;
    }

    // Lazy require — only loaded when the provider is actually used
    let sdk: any;
    try {
      sdk = require('livekit-server-sdk');
    } catch {
      throw new Error(
        '[Sockr] LiveKitSFUProvider requires livekit-server-sdk. ' +
        'Install it: npm install livekit-server-sdk'
      );
    }

    this.roomService = new sdk.RoomServiceClient(
      this.config.host,
      this.config.apiKey,
      this.config.apiSecret
    );
    this.ownClient = true;
  }

  public async disconnect(): Promise<void> {
    if (this.ownClient) {
      this.roomService = null;
    }
  }

  // ─── Token generation ───────────────────────────────────────────────────────

  public async generateToken(
    roomName: string,
    participantIdentity: string,
    opts: TokenOptions = {}
  ): Promise<string> {
    let sdk: any;
    try {
      sdk = require('livekit-server-sdk');
    } catch {
      throw new Error(
        '[Sockr] LiveKitSFUProvider requires livekit-server-sdk. ' +
        'Install it: npm install livekit-server-sdk'
      );
    }

    const ttl = opts.ttl ?? this.config.defaultTtl ?? 3600;
    const at = new sdk.AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: participantIdentity,
      ttl: `${ttl}s`,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: opts.canPublish ?? true,
      canSubscribe: opts.canSubscribe ?? true,
    });

    return at.toJwt();
  }

  // ─── Room management ────────────────────────────────────────────────────────

  public async createRoom(roomName: string, opts: RoomOptions = {}): Promise<void> {
    this.ensureConnected();
    await this.roomService.createRoom({
      name: roomName,
      emptyTimeout: opts.emptyTimeout ?? 300,
    });
  }

  public async deleteRoom(roomName: string): Promise<void> {
    this.ensureConnected();
    await this.roomService.deleteRoom(roomName);
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (!this.roomService) {
      throw new Error(
        '[Sockr] LiveKitSFUProvider is not connected. ' +
        'Ensure connect() has been called (this happens automatically in server.listen()).'
      );
    }
  }
}
