import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { SocketEvent, EventPayloads } from 'sockr-shared';
import type { ISFUClientAdapter } from '../../interfaces/ISFUClientAdapter';

export type ConferenceState = 'idle' | 'joining' | 'active' | 'ended' | 'error';

export interface ConferenceCallParticipant {
  userId: string;
}

export interface UseConferenceCallOptions {
  /** SFU client adapter (e.g. new LiveKitClientAdapter()). */
  adapter: ISFUClientAdapter;
  /** Publish audio on join. Default: true. */
  audio?: boolean;
  /** Publish video on join. Default: false. */
  video?: boolean;
}

export interface UseConferenceCallReturn {
  conferenceState: ConferenceState;
  /** Participants currently in the conference (includes the local user). */
  participants: ConferenceCallParticipant[];
  error: string | null;
  /** Ask the server to join (or start) a conference for the given group. */
  joinConference: (groupId: string) => void;
  /** Leave the current conference. */
  leaveConference: () => void;
  /** The groupId of the active conference room, or null. */
  activeGroupId: string | null;
  /**
   * Called by the adapter when a remote track is received.
   * Register a handler to attach remote audio/video to DOM elements.
   */
  onRemoteTrack: (handler: (track: MediaStreamTrack, participantId: string) => void) => void;
}

export const useConferenceCall = (opts: UseConferenceCallOptions): UseConferenceCallReturn => {
  const { client } = useSocket();
  const { adapter, audio = true, video = false } = opts;

  const [conferenceState, setConferenceState] = useState<ConferenceState>('idle');
  const [participants, setParticipants] = useState<ConferenceCallParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const activeGroupIdRef = useRef<string | null>(null);
  const remoteTrackHandler = useRef<((track: MediaStreamTrack, participantId: string) => void) | null>(null);

  const setGroup = useCallback((id: string | null) => {
    activeGroupIdRef.current = id;
    setActiveGroupId(id);
  }, []);

  const cleanup = useCallback(async () => {
    try {
      await adapter.disconnect();
    } catch {
      // Best-effort disconnect
    }
    setGroup(null);
    setParticipants([]);
    setConferenceState('idle');
    setError(null);
  }, [adapter, setGroup]);

  // Cleanup on unmount
  useEffect(() => () => { adapter.disconnect().catch(() => {}); }, [adapter]);

  // ─── CONFERENCE_TOKEN — received after joinConference() ─────────────────

  useSocketEvent(
    'conference_token',
    async (data: EventPayloads[SocketEvent.CONFERENCE_TOKEN]) => {
      if (data.groupId !== activeGroupIdRef.current) return;

      try {
        await adapter.connect(data.sfuUrl, data.token, { audio, video });

        // Forward remote track events to the consumer's handler
        adapter.onTrackSubscribed((track, participantId) => {
          remoteTrackHandler.current?.(track, participantId);
        });
        adapter.onTrackUnsubscribed((_track, participantId) => {
          setParticipants((prev) => prev.filter((p) => p.userId !== participantId));
        });
        adapter.onParticipantConnected((participantId) => {
          setParticipants((prev) => {
            if (prev.some((p) => p.userId === participantId)) return prev;
            return [...prev, { userId: participantId }];
          });
        });
        adapter.onParticipantDisconnected((participantId) => {
          setParticipants((prev) => prev.filter((p) => p.userId !== participantId));
        });
        adapter.onDisconnected(() => {
          setConferenceState('ended');
          setGroup(null);
        });

        setConferenceState('active');
      } catch (err: any) {
        setError(err?.message ?? 'Failed to connect to SFU');
        setConferenceState('error');
      }
    },
    [adapter, audio, video, setGroup]
  );

  // ─── CONFERENCE_STARTED ──────────────────────────────────────────────────

  useSocketEvent(
    'conference_started',
    (data: EventPayloads[SocketEvent.CONFERENCE_STARTED]) => {
      if (data.groupId !== activeGroupIdRef.current) return;
      // participantCount will be reflected once the SFU connection resolves
    },
    []
  );

  // ─── CONFERENCE_ENDED ────────────────────────────────────────────────────

  useSocketEvent(
    'conference_ended',
    async (data: EventPayloads[SocketEvent.CONFERENCE_ENDED]) => {
      if (data.groupId !== activeGroupIdRef.current) return;
      await cleanup();
      setConferenceState('ended');
    },
    [cleanup]
  );

  // ─── CONFERENCE_PARTICIPANT_JOINED ───────────────────────────────────────

  useSocketEvent(
    'conference_participant_joined',
    (data: EventPayloads[SocketEvent.CONFERENCE_PARTICIPANT_JOINED]) => {
      if (data.groupId !== activeGroupIdRef.current) return;
      setParticipants((prev) => {
        if (prev.some((p) => p.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId }];
      });
    },
    []
  );

  // ─── CONFERENCE_PARTICIPANT_LEFT ─────────────────────────────────────────

  useSocketEvent(
    'conference_participant_left',
    (data: EventPayloads[SocketEvent.CONFERENCE_PARTICIPANT_LEFT]) => {
      if (data.groupId !== activeGroupIdRef.current) return;
      setParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
    },
    []
  );

  // ─── CONFERENCE_ERROR ────────────────────────────────────────────────────

  useSocketEvent(
    'conference_error',
    (data: EventPayloads[SocketEvent.CONFERENCE_ERROR]) => {
      if (data.groupId !== activeGroupIdRef.current) return;
      setError(data.error);
      setConferenceState('error');
    },
    []
  );

  // ─── Public actions ──────────────────────────────────────────────────────

  const joinConference = useCallback(
    (groupId: string) => {
      if (!client) throw new Error('[Sockr] Not connected');
      if (conferenceState !== 'idle' && conferenceState !== 'ended') return;

      setGroup(groupId);
      setConferenceState('joining');
      setError(null);
      client.joinConference(groupId);
    },
    [client, conferenceState, setGroup]
  );

  const leaveConference = useCallback(async () => {
    if (!client || !activeGroupIdRef.current) return;
    client.leaveConference(activeGroupIdRef.current);
    await cleanup();
  }, [client, cleanup]);

  const onRemoteTrack = useCallback(
    (handler: (track: MediaStreamTrack, participantId: string) => void) => {
      remoteTrackHandler.current = handler;
    },
    []
  );

  return {
    conferenceState,
    participants,
    error,
    joinConference,
    leaveConference,
    activeGroupId,
    onRemoteTrack,
  };
};
