import type { IMessageStore } from 'sockr-shared';
import type { PersistedMessage, PaginationOpts } from 'sockr-shared';
import type { Group, GroupMember } from 'sockr-shared';

export interface MongoMessageStoreConfig {
  /** MongoDB connection URI. Required unless `connection` is provided. */
  uri?: string;
  /** Database name. Defaults to 'sockr'. */
  dbName?: string;
  /** Override individual collection names. */
  collections?: {
    messages?: string;
    groups?: string;
    groupMembers?: string;
    deliveryReceipts?: string;
  };
  /**
   * Pass an existing mongoose Connection or MongoClient.
   * When provided, `uri` is ignored — Sockr reuses your connection.
   */
  connection?: any; // mongoose.Connection | MongoClient
}

/**
 * MongoDB implementation of IMessageStore.
 *
 * Requires mongoose to be installed:
 *   npm install mongoose
 *
 * Usage:
 *   new SocketServer({
 *     providers: {
 *       messageStore: new MongoMessageStore({ uri: process.env.MONGO_URI })
 *     }
 *   })
 *
 * Reuse an existing mongoose connection:
 *   new MongoMessageStore({ connection: mongoose.connection })
 */
export class MongoMessageStore implements IMessageStore {
  private config: Required<Omit<MongoMessageStoreConfig, 'uri' | 'connection'>> & MongoMessageStoreConfig;
  private mongoose: any = null;
  private conn: any = null;

  private MessageModel: any = null;
  private GroupModel: any = null;
  private GroupMemberModel: any = null;

  constructor(config: MongoMessageStoreConfig) {
    this.config = {
      dbName: 'sockr',
      ...config,
      collections: {
        messages: 'sockr_messages',
        groups: 'sockr_groups',
        groupMembers: 'sockr_group_members',
        deliveryReceipts: 'sockr_delivery_receipts',
        ...config.collections,
      },
    };
  }

  private async getMongoose(): Promise<any> {
    if (!this.mongoose) {
      try {
        this.mongoose = require('mongoose');
      } catch {
        throw new Error(
          '[Sockr] MongoMessageStore requires mongoose to be installed.\n' +
          'Run: npm install mongoose'
        );
      }
    }
    return this.mongoose;
  }

  async connect(): Promise<void> {
    const mongoose = await this.getMongoose();

    if (this.config.connection) {
      // Reuse provided connection
      this.conn = this.config.connection;
    } else {
      if (!this.config.uri) {
        throw new Error('[Sockr] MongoMessageStore requires either uri or connection.');
      }
      this.conn = await mongoose.createConnection(this.config.uri, {
        dbName: this.config.dbName,
      });
    }

    this.initModels(mongoose);
  }

  private initModels(mongoose: any): void {
    const cols = this.config.collections!;

    const messageSchema = new mongoose.Schema(
      {
        id: { type: String, required: true, unique: true },
        conversationId: { type: String, required: true, index: true },
        from: { type: String, required: true },
        to: { type: String },
        groupId: { type: String },
        content: { type: String, required: true },
        timestamp: { type: Number, required: true, index: true },
        metadata: { type: mongoose.Schema.Types.Mixed },
        deliveredTo: { type: [String], default: [] },
        readBy: { type: [String], default: [] },
      },
      { collection: cols.messages }
    );
    messageSchema.index({ conversationId: 1, timestamp: -1 });
    messageSchema.index({ to: 1, deliveredTo: 1 });

    const groupSchema = new mongoose.Schema(
      {
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        createdBy: { type: String, required: true },
        createdAt: { type: Number, required: true },
        members: { type: [String], default: [], index: true },
        metadata: { type: mongoose.Schema.Types.Mixed },
      },
      { collection: cols.groups }
    );

    const groupMemberSchema = new mongoose.Schema(
      {
        groupId: { type: String, required: true, index: true },
        userId: { type: String, required: true },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        joinedAt: { type: Number, required: true },
      },
      { collection: cols.groupMembers }
    );
    groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });

    this.MessageModel = this.conn.model('SockrMessage', messageSchema);
    this.GroupModel = this.conn.model('SockrGroup', groupSchema);
    this.GroupMemberModel = this.conn.model('SockrGroupMember', groupMemberSchema);
  }

  private ensureConnected(): void {
    if (!this.MessageModel) {
      throw new Error(
        '[Sockr] MongoMessageStore not connected. ' +
        'Ensure SocketServer has initialized before handling connections.'
      );
    }
  }

  async saveMessage(message: PersistedMessage): Promise<PersistedMessage> {
    this.ensureConnected();
    await this.MessageModel.findOneAndUpdate(
      { id: message.id },
      { $set: message },
      { upsert: true, new: true }
    );
    return message;
  }

  async getMessage(messageId: string): Promise<PersistedMessage | null> {
    this.ensureConnected();
    const doc = await this.MessageModel.findOne({ id: messageId }).lean();
    return doc ? this.toPersistedMessage(doc) : null;
  }

  async getMessages(
    conversationId: string,
    opts: PaginationOpts
  ): Promise<PersistedMessage[]> {
    this.ensureConnected();
    const query: any = { conversationId };
    if (opts.before) query.timestamp = { ...query.timestamp, $lt: opts.before };
    if (opts.after) query.timestamp = { ...query.timestamp, $gt: opts.after };

    const docs = await this.MessageModel.find(query)
      .sort({ timestamp: -1 })
      .limit(opts.limit)
      .lean();

    return docs.reverse().map(this.toPersistedMessage.bind(this));
  }

  async getUndeliveredMessages(userId: string): Promise<PersistedMessage[]> {
    this.ensureConnected();
    const docs = await this.MessageModel.find({
      $or: [
        { to: userId, deliveredTo: { $nin: [userId] } },
        { 'members': userId, deliveredTo: { $nin: [userId] } },
      ],
    }).lean();
    return docs.map(this.toPersistedMessage.bind(this));
  }

  async markDelivered(messageId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await this.MessageModel.updateOne(
      { id: messageId },
      { $addToSet: { deliveredTo: userId } }
    );
  }

  async markRead(messageId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await this.MessageModel.updateOne(
      { id: messageId },
      { $addToSet: { readBy: userId } }
    );
  }

  async saveGroup(group: Group): Promise<Group> {
    this.ensureConnected();
    await this.GroupModel.findOneAndUpdate(
      { id: group.id },
      { $set: group },
      { upsert: true, new: true }
    );
    return group;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    this.ensureConnected();
    const doc = await this.GroupModel.findOne({ id: groupId }).lean();
    return doc ? this.toGroup(doc) : null;
  }

  async updateGroup(
    groupId: string,
    updates: Partial<Pick<Group, 'name' | 'metadata'>>
  ): Promise<Group> {
    this.ensureConnected();
    const doc = await this.GroupModel.findOneAndUpdate(
      { id: groupId },
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) throw new Error(`Group ${groupId} not found`);
    return this.toGroup(doc);
  }

  async deleteGroup(groupId: string): Promise<void> {
    this.ensureConnected();
    await Promise.all([
      this.GroupModel.deleteOne({ id: groupId }),
      this.GroupMemberModel.deleteMany({ groupId }),
      this.MessageModel.deleteMany({ conversationId: groupId }),
    ]);
  }

  async addGroupMember(groupId: string, member: GroupMember): Promise<void> {
    this.ensureConnected();
    await Promise.all([
      this.GroupMemberModel.findOneAndUpdate(
        { groupId, userId: member.userId },
        { $set: member },
        { upsert: true }
      ),
      this.GroupModel.updateOne(
        { id: groupId },
        { $addToSet: { members: member.userId } }
      ),
    ]);
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await Promise.all([
      this.GroupMemberModel.deleteOne({ groupId, userId }),
      this.GroupModel.updateOne(
        { id: groupId },
        { $pull: { members: userId } }
      ),
    ]);
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    this.ensureConnected();
    const docs = await this.GroupMemberModel.find({ groupId }).lean();
    return docs.map((d: any) => ({
      userId: d.userId,
      role: d.role,
      joinedAt: d.joinedAt,
    }));
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    this.ensureConnected();
    const docs = await this.GroupModel.find({ members: userId }).lean();
    return docs.map(this.toGroup.bind(this));
  }

  private toPersistedMessage(doc: any): PersistedMessage {
    return {
      id: doc.id,
      conversationId: doc.conversationId,
      from: doc.from,
      to: doc.to,
      groupId: doc.groupId,
      content: doc.content,
      timestamp: doc.timestamp,
      metadata: doc.metadata,
      deliveredTo: doc.deliveredTo || [],
      readBy: doc.readBy || [],
    };
  }

  private toGroup(doc: any): Group {
    return {
      id: doc.id,
      name: doc.name,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      members: doc.members || [],
      metadata: doc.metadata,
    };
  }

  async disconnect(): Promise<void> {
    if (this.conn && !this.config.connection) {
      await this.conn.close();
    }
  }
}