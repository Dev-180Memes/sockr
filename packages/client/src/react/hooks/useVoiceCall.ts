import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './useSocket';
import { useSocketEvent } from './useSocketEvent';
import { SocketEvent, EventPayloads, IceServer, IceCandidateInit } from 'sockr-shared';

export type CallState = 'idle' | 'calling' | 'ringing' | 'active' | 'busy' | 'ended';

export interface IncomingCall {
  callId: string;
  from: string;
  sdpOffer: string;
  iceServers: IceServer[];
}

export interface UseVoiceCallReturn {
  callState: CallState;
  /** Set when another user is calling you. Display this to show the incoming call UI. */
  incomingCall: IncomingCall | null;
  /** The remote audio stream. Attach to an <audio autoPlay /> element. */
  remoteStream: MediaStream | null;
  currentCallId: string | null;
  /** Fetch ICE servers then create offer, get mic, and call the target user. */
  startCall: (userId: string) => Promise<void>;
  /** Accept an incoming call. Must be called while incomingCall is set. */
  answerCall: () => Promise<void>;
  /** Reject an incoming call without answering. */
  rejectCall: () => void;
  /** End the current call (caller or callee). */
  hangUp: () => void;
}

export const useVoiceCall = (): UseVoiceCallReturn => {
  const { client } = useSocket();

  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);

  // Refs used inside async callbacks to avoid stale closure issues
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingCandidates = useRef<IceCandidateInit[]>([]);

  const setCallId = useCallback((id: string | null) => {
    callIdRef.current = id;
    setCurrentCallId(id);
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingCandidates.current = [];
    setCallId(null);
    setRemoteStream(null);
    setCallState('idle');
    setIncomingCall(null);
  }, [setCallId]);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  // ─── Build RTCPeerConnection ─────────────────────────────────────────────

  const buildPeerConnection = useCallback(
    (iceServers: IceServer[]): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate && callIdRef.current && client) {
          client.sendIceCandidate(callIdRef.current, {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            usernameFragment: candidate.usernameFragment,
          });
        }
      };

      pc.ontrack = ({ streams }) => {
        if (streams[0]) setRemoteStream(streams[0]);
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed'
        ) {
          cleanup();
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [client, cleanup]
  );

  // ─── Drain buffered ICE candidates ──────────────────────────────────────

  const drainCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    for (const c of pendingCandidates.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c as RTCIceCandidateInit));
    }
    pendingCandidates.current = [];
  }, []);

  // ─── Incoming call ───────────────────────────────────────────────────────

  useSocketEvent(
    'call_incoming',
    (data: EventPayloads[SocketEvent.CALL_INCOMING]) => {
      // Auto-reject if we're already in a call
      if (callState !== 'idle') {
        client?.rejectCall(data.callId);
        return;
      }
      setIncomingCall(data);
      setCallState('ringing');
    },
    [callState, client]
  );

  // ─── Caller: call is ringing on recipient's end ──────────────────────────

  useSocketEvent(
    'call_ringing',
    (data: EventPayloads[SocketEvent.CALL_RINGING]) => {
      setCallId(data.callId);
      setCallState('ringing');
    },
    [setCallId]
  );

  // ─── Caller: callee answered ─────────────────────────────────────────────

  useSocketEvent(
    'call_answered',
    async (data: EventPayloads[SocketEvent.CALL_ANSWERED]) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdpAnswer });
      await drainCandidates();
      setCallState('active');
    },
    [drainCandidates]
  );

  // ─── Call rejected / ended / busy ───────────────────────────────────────

  useSocketEvent(
    'call_rejected',
    (_data: EventPayloads[SocketEvent.CALL_REJECTED]) => cleanup(),
    [cleanup]
  );

  useSocketEvent(
    'call_ended',
    (_data: EventPayloads[SocketEvent.CALL_ENDED]) => cleanup(),
    [cleanup]
  );

  useSocketEvent(
    'call_busy',
    (_data: EventPayloads[SocketEvent.CALL_BUSY]) => {
      cleanup();
      setCallState('busy');
    },
    [cleanup]
  );

  // ─── ICE candidate trickle ───────────────────────────────────────────────

  useSocketEvent(
    'call_ice_candidate',
    async (data: EventPayloads[SocketEvent.CALL_ICE_CANDIDATE]) => {
      const pc = pcRef.current;
      if (!pc?.remoteDescription) {
        pendingCandidates.current.push(data.candidate);
      } else {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit));
      }
    },
    []
  );

  // ─── startCall ───────────────────────────────────────────────────────────

  const startCall = useCallback(
    async (userId: string) => {
      if (!client) throw new Error('[Sockr] Not connected');
      if (callState !== 'idle') throw new Error('[Sockr] Already in a call');

      // Fetch fresh ICE servers from the server before creating the PeerConnection
      const iceServers = await new Promise<IceServer[]>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('[Sockr] ICE server fetch timed out')),
          5000
        );
        const unsub = client.on(
          'call_ice_servers',
          (d: EventPayloads[SocketEvent.CALL_ICE_SERVERS]) => {
            clearTimeout(timeout);
            unsub();
            resolve(d.iceServers);
          }
        );
        client.getIceServers();
      });

      const pc = buildPeerConnection(iceServers);
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setCallState('calling');
      client.initiateCall(userId, offer.sdp!);
    },
    [client, callState, buildPeerConnection]
  );

  // ─── answerCall ──────────────────────────────────────────────────────────

  const answerCall = useCallback(async () => {
    if (!client || !incomingCall) return;

    const { callId, sdpOffer, iceServers } = incomingCall;
    setCallId(callId);

    const pc = buildPeerConnection(iceServers);

    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = localStream;
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    await pc.setRemoteDescription({ type: 'offer', sdp: sdpOffer });
    await drainCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    setCallState('active');
    setIncomingCall(null);
    client.answerCall(callId, answer.sdp!);
  }, [client, incomingCall, setCallId, buildPeerConnection, drainCandidates]);

  // ─── rejectCall ──────────────────────────────────────────────────────────

  const rejectCall = useCallback(() => {
    if (!client || !incomingCall) return;
    client.rejectCall(incomingCall.callId);
    cleanup();
  }, [client, incomingCall, cleanup]);

  // ─── hangUp ──────────────────────────────────────────────────────────────

  const hangUp = useCallback(() => {
    if (!client || !callIdRef.current) return;
    client.hangUp(callIdRef.current);
    cleanup();
  }, [client, cleanup]);

  return {
    callState,
    incomingCall,
    remoteStream,
    currentCallId,
    startCall,
    answerCall,
    rejectCall,
    hangUp,
  };
};
