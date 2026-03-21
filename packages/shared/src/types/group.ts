export type GroupMemeberRole = 'admin' | 'member';

export interface GroupMember {
  userId: string;
  role: GroupMemeberRole;
  joinedAt: number;
}

export interface Group {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  members: string[];
  metadata?: Record<string, any>;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  from: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
  deliveredTo: string[];
  readBy: string[];
}