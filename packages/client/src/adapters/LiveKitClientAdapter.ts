import {
  ISFUClientAdapter,
  SFUConnectOptions,
  SFUPublishOptions,
} from '../interfaces/ISFUClientAdapter';

/**
 * LiveKit implementation of ISFUClientAdapter.
 *
 * Requires `livekit-client` to be installed in the consuming project:
 *   npm install livekit-client
 *
 * The SDK is loaded lazily at runtime — engineers who use a different SFU
 * are not affected by this dependency.
 *
 * @example
 * const adapter = new LiveKitClientAdapter();
 * const { joinConference } = useConferenceCall({ adapter });
 */
export class LiveKitClientAdapter implements ISFUClientAdapter {
  private room: any | null = null;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  public async connect(
    sfuUrl: string,
    token: string,
    opts: SFUConnectOptions = {}
  ): Promise<void> {
    const sdk = this.requireSDK();

    this.room = new sdk.Room();
    this.bindRoomEvents();

    await this.room.connect(sfuUrl, token, {
      autoSubscribe: true,
    });

    if (opts.audio !== false || opts.video) {
      await this.publishTracks({ audio: opts.audio !== false, video: opts.video ?? false });
    }
  }

  public async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  // ─── Publishing ─────────────────────────────────────────────────────────────

  public async publishTracks(opts: SFUPublishOptions = {}): Promise<void> {
    if (!this.room) return;
    const sdk = this.requireSDK();

    if (opts.audio) {
      const audioTrack = await sdk.createLocalAudioTrack();
      await this.room.localParticipant.publishTrack(audioTrack);
    }
    if (opts.video) {
      const videoTrack = await sdk.createLocalVideoTrack();
      await this.room.localParticipant.publishTrack(videoTrack);
    }
  }

  // ─── Event forwarding ───────────────────────────────────────────────────────

  public onTrackSubscribed(
    handler: (track: MediaStreamTrack, participantId: string) => void
  ): void {
    this.ensureRoom('onTrackSubscribed');
    const sdk = this.requireSDK();

    this.room.on(
      sdk.RoomEvent.TrackSubscribed,
      (track: any, _pub: any, participant: any) => {
        handler(track.mediaStreamTrack, participant.identity);
      }
    );
  }

  public onTrackUnsubscribed(
    handler: (track: MediaStreamTrack, participantId: string) => void
  ): void {
    this.ensureRoom('onTrackUnsubscribed');
    const sdk = this.requireSDK();

    this.room.on(
      sdk.RoomEvent.TrackUnsubscribed,
      (track: any, _pub: any, participant: any) => {
        handler(track.mediaStreamTrack, participant.identity);
      }
    );
  }

  public onParticipantConnected(handler: (participantId: string) => void): void {
    this.ensureRoom('onParticipantConnected');
    const sdk = this.requireSDK();

    this.room.on(sdk.RoomEvent.ParticipantConnected, (participant: any) => {
      handler(participant.identity);
    });
  }

  public onParticipantDisconnected(handler: (participantId: string) => void): void {
    this.ensureRoom('onParticipantDisconnected');
    const sdk = this.requireSDK();

    this.room.on(sdk.RoomEvent.ParticipantDisconnected, (participant: any) => {
      handler(participant.identity);
    });
  }

  public onDisconnected(handler: () => void): void {
    this.ensureRoom('onDisconnected');
    const sdk = this.requireSDK();

    this.room.on(sdk.RoomEvent.Disconnected, handler);
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private bindRoomEvents(): void {
    // Room events are bound lazily via the on*() methods.
    // This method is a hook for any setup needed immediately after room creation.
  }

  private requireSDK(): any {
    try {
      return require('livekit-client');
    } catch {
      throw new Error(
        '[Sockr] LiveKitClientAdapter requires livekit-client. ' +
        'Install it: npm install livekit-client'
      );
    }
  }

  private ensureRoom(method: string): void {
    if (!this.room) {
      throw new Error(
        `[Sockr] LiveKitClientAdapter.${method}() called before connect(). ` +
        'Call connect() first or register event handlers after receiving CONFERENCE_TOKEN.'
      );
    }
  }
}
