import type { PersistedMessage, PaginationOpts } from "../types/message";
import type { Group, GroupMember } from "../types/group";

/**
 * Persistence contract for all messages and group metadata.
 * 
 * Implement this interface to use any database with Sockr
 * 
 *  class MyStore implement IMessageStore {...}
 *  new SocketServer({ providers: { messageStore: new MyStore() } })
 */
export interface IMessageStore {
  /**
   * Persist a message. Called immediately when a message is received,
   * before delivery is attempted.
   */
  saveMessage(message: PersistedMessage): Promise<PersistedMessage>;

  /** Retrieve a single message by its ID. */
  getMessage(messageId: string): Promise<PersistedMessage | null>;

  /**
   * Retrieve paginated message history for a conversation.
   * conversationId is `${userA}:${userB}` (sorted) for 1:1,
   * or the groupId for group conversations.
   */
  getMessages(
    conversationId: string,
    opts: PaginationOpts
  ): Promise<PersistedMessage[]>;
 
  /**
   * Return all messages that have not yet been delivered to a given user.
   * Used to flush the queue when a user reconnects.
   */
  getUndeliveredMessages(userId: string): Promise<PersistedMessage[]>;
 
  /** Mark a message as delivered to a specific user. */
  markDelivered(messageId: string, userId: string): Promise<void>;
 
  /** Mark a message as read by a specific user. */
  markRead(messageId: string, userId: string): Promise<void>;
 
  // ─── Groups ───────────────────────────────────────────────────────────────
 
  /** Persist a new group record. */
  saveGroup(group: Group): Promise<Group>;
 
  /** Retrieve a group by its ID. Returns null if not found. */
  getGroup(groupId: string): Promise<Group | null>;
 
  /** Update a group's metadata/name. */
  updateGroup(groupId: string, updates: Partial<Pick<Group, 'name' | 'metadata'>>): Promise<Group>;
 
  /** Delete a group and all associated membership records. */
  deleteGroup(groupId: string): Promise<void>;
 
  /** Add a member to a group. */
  addGroupMember(groupId: string, member: GroupMember): Promise<void>;
 
  /** Remove a member from a group. */
  removeGroupMember(groupId: string, userId: string): Promise<void>;
 
  /** Retrieve all members of a group. */
  getGroupMembers(groupId: string): Promise<GroupMember[]>;
 
  /** Retrieve all groups a user belongs to. */
  getUserGroups(userId: string): Promise<Group[]>;
}