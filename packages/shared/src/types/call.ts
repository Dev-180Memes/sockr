export type CallStatus = 'initiating' | 'ringing' | 'active' | 'ended' | 'rejected' | 'busy';

/**
 * ICE server configuration (STUN or TURN).
 * Mirrors RTCIceServer so it's safe to cast directly to it on the client.
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Serialisable form of RTCIceCandidateInit — safe to send over the socket.
 */
export interface IceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface ActiveCall {
  callId: string;
  callerId: string;
  calleeId: string;
  status: CallStatus;
  startedAt: number;
}
