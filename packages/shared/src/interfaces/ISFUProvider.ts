export interface TokenOptions {
  /** Credential lifetime in seconds. Defaults to 3600 (1 hour). */
  ttl?: number;
  /** Whether the participant can publish audio/video. Defaults to true. */
  canPublish?: boolean;
  /** Whether the participant can subscribe to others' tracks. Defaults to true. */
  canSubscribe?: boolean;
}

export interface RoomOptions {
  /**
   * Seconds before an empty room is automatically deleted on the SFU.
   * Defaults to 300 (5 minutes).
   */
  emptyTimeout?: number;
}

/**
 * Server-side SFU abstraction. Implement this interface to connect Sockr's
 * ConferencePlugin to any SFU — LiveKit, mediasoup, Janus, or a custom solution.
 *
 * Sockr ships `LiveKitSFUProvider` as the reference implementation.
 *
 * @example
 * import { SocketServer } from 'sockr-server';
 * import { LiveKitSFUProvider } from 'sockr-server';
 *
 * const server = new SocketServer({ ... });
 * server.useConference(
 *   new LiveKitSFUProvider({
 *     apiKey: process.env.LIVEKIT_API_KEY,
 *     apiSecret: process.env.LIVEKIT_API_SECRET,
 *     host: 'https://your-livekit.example.com',
 *   }),
 *   'wss://your-livekit.example.com'
 * );
 */
export interface ISFUProvider {
  /** Optional lifecycle: called once when the server starts. */
  connect?(): Promise<void>;
  /** Optional lifecycle: called once when the server shuts down. */
  disconnect?(): Promise<void>;
  /**
   * Generate a short-lived access token for a participant to join a room.
   * The token is delivered to the client via socket — the API secret never
   * leaves the server.
   */
  generateToken(
    roomName: string,
    participantIdentity: string,
    opts?: TokenOptions
  ): Promise<string>;
  /** Create a room on the SFU. Called when the first participant joins a group call. */
  createRoom?(roomName: string, opts?: RoomOptions): Promise<void>;
  /** Delete a room on the SFU. Called when the last participant leaves. */
  deleteRoom?(roomName: string): Promise<void>;
}
