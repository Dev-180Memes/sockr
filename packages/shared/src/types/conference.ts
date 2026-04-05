export interface ConferenceParticipant {
  userId: string;
  joinedAt: number;
}

export interface ConferenceRoom {
  groupId: string;
  participants: ConferenceParticipant[];
  startedAt: number;
  startedBy: string;
}
