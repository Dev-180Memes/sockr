export interface User {
  id: string;
  socketId: string;
  connectedAt: number;
  metadata?: Record<string, any>;
}

export interface UserConnection {
  userId: string;
  socketId: string;
  isOnline: boolean;
}