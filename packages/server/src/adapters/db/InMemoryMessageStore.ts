import { randomUUID } from 'crypto';
import type { IMessageStore } from 'sockr-shared';
import type { PersistedMessage, PaginationOpts } from 'sockr-shared';
import type { Group, GroupMember } from 'sockr-shared';

/**
 * In-memory implementation of IMessageStore.
 *
 * Zero configuration required — used automatically when no messageStore
 * provider is passed to SocketServer.
 *
 * WARNING: All data is lost when the server restarts.
 * Not suitable for production. Use MongoMessageStore, PostgresMessageStore,
 * or MySQLMessageStore in production environments.
 */
export class InMemoryMessageStore implements IMessageStore {
  private messages: Map<string, PersistedMessage> = new Map();
  // conversationId → sorted message IDs
  private conversations: Map<string, string[]> = new Map();
  private groups: Map<string, Group> = new Map();
  private groupMembers: Map<string, GroupMember[]> = new Map();

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Sockr] InMemoryMessageStore is active in production. ' +
        'Messages will not survive restarts. ' +
        'Pass a messageStore provider to SocketServer to silence this warning.'
      );
    }
  }

  async saveMessage(message: PersistedMessage): Promise<PersistedMessage> {
    const msg = { ...message, id: message.id || randomUUID() };
    this.messages.set(msg.id, msg);

    const ids = this.conversations.get(msg.conversationId) || [];
    ids.push(msg.id);
    this.conversations.set(msg.conversationId, ids);

    return msg;
  }

  async getMessage(messageId: string): Promise<PersistedMessage | null> {
    return this.messages.get(messageId) || null;
  }

  async getMessages(
    conversationId: string,
    opts: PaginationOpts
  ): Promise<PersistedMessage[]> {
    const ids = this.conversations.get(conversationId) || [];
    let msgs = ids
      .map((id) => this.messages.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (opts.before) {
      msgs = msgs.filter((m) => m.timestamp < opts.before!);
    }
    if (opts.after) {
      msgs = msgs.filter((m) => m.timestamp > opts.after!);
    }

    return msgs.slice(-opts.limit);
  }

  async getUndeliveredMessages(userId: string): Promise<PersistedMessage[]> {
    return Array.from(this.messages.values()).filter(
      (m) =>
        !m.deliveredTo.includes(userId) &&
        (m.to === userId || m.groupId !== undefined)
    );
  }

  async markDelivered(messageId: string, userId: string): Promise<void> {
    const msg = this.messages.get(messageId);
    if (msg && !msg.deliveredTo.includes(userId)) {
      msg.deliveredTo.push(userId);
    }
  }

  async markRead(messageId: string, userId: string): Promise<void> {
    const msg = this.messages.get(messageId);
    if (msg && !msg.readBy.includes(userId)) {
      msg.readBy.push(userId);
    }
  }

  async saveGroup(group: Group): Promise<Group> {
    this.groups.set(group.id, { ...group });
    if (!this.groupMembers.has(group.id)) {
      this.groupMembers.set(group.id, []);
    }
    return group;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    return this.groups.get(groupId) || null;
  }

  async updateGroup(
    groupId: string,
    updates: Partial<Pick<Group, 'name' | 'metadata'>>
  ): Promise<Group> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const updated = { ...group, ...updates };
    this.groups.set(groupId, updated);
    return updated;
  }

  async deleteGroup(groupId: string): Promise<void> {
    this.groups.delete(groupId);
    this.groupMembers.delete(groupId);
    // Remove all messages in this group's conversation
    const ids = this.conversations.get(groupId) || [];
    ids.forEach((id) => this.messages.delete(id));
    this.conversations.delete(groupId);
  }

  async addGroupMember(groupId: string, member: GroupMember): Promise<void> {
    const members = this.groupMembers.get(groupId) || [];
    if (!members.find((m) => m.userId === member.userId)) {
      members.push(member);
      this.groupMembers.set(groupId, members);
    }

    // Keep group.members array in sync
    const group = this.groups.get(groupId);
    if (group && !group.members.includes(member.userId)) {
      group.members.push(member.userId);
    }
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const members = this.groupMembers.get(groupId) || [];
    this.groupMembers.set(
      groupId,
      members.filter((m) => m.userId !== userId)
    );

    const group = this.groups.get(groupId);
    if (group) {
      group.members = group.members.filter((id) => id !== userId);
    }
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    return this.groupMembers.get(groupId) || [];
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    return Array.from(this.groups.values()).filter((g) =>
      g.members.includes(userId)
    );
  }
}