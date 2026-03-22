import type { IMessageStore } from 'sockr-shared';
import type { PersistedMessage, PaginationOpts } from 'sockr-shared';
import type { Group, GroupMember } from 'sockr-shared';

export interface MySQLMessageStoreConfig {
  /** Option A: full connection string  e.g. mysql://user:pass@host/db */
  connectionString?: string;
  /** Option B: individual fields */
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** Option C: pass an existing mysql2 Pool — Sockr will not create a new one */
  pool?: any;
  /** Prefix for all Sockr tables. Defaults to 'sockr_'. */
  tablePrefix?: string;
  /**
   * Run CREATE TABLE IF NOT EXISTS on startup.
   * Set to false if you manage migrations yourself.
   * Defaults to true.
   */
  autoMigrate?: boolean;
}

/**
 * MySQL implementation of IMessageStore.
 *
 * Requires mysql2 to be installed:
 *   npm install mysql2
 *
 * Usage:
 *   new SocketServer({
 *     providers: {
 *       messageStore: new MySQLMessageStore({
 *         host: 'localhost',
 *         database: 'myapp',
 *         user: 'root',
 *         password: 'secret'
 *       })
 *     }
 *   })
 *
 * Reuse an existing pool:
 *   new MySQLMessageStore({ pool: existingPool })
 */
export class MySQLMessageStore implements IMessageStore {
  private pool: any = null;
  private mysql2: any = null;
  private ownPool: boolean = false;
  private p: string;
  private autoMigrate: boolean;
  private config: MySQLMessageStoreConfig;

  constructor(config: MySQLMessageStoreConfig) {
    this.config = config;
    this.p = config.tablePrefix ?? 'sockr_';
    this.autoMigrate = config.autoMigrate ?? true;
  }

  private get t() {
    return {
      messages: `\`${this.p}messages\``,
      groups: `\`${this.p}groups\``,
      groupMembers: `\`${this.p}group_members\``,
    };
  }

  private async getMySQL(): Promise<any> {
    if (!this.mysql2) {
      try {
        this.mysql2 = require('mysql2/promise');
      } catch {
        throw new Error(
          '[Sockr] MySQLMessageStore requires mysql2 to be installed.\n' +
          'Run: npm install mysql2'
        );
      }
    }
    return this.mysql2;
  }

  async connect(): Promise<void> {
    const mysql = await this.getMySQL();

    if (this.config.pool) {
      this.pool = this.config.pool;
      this.ownPool = false;
    } else {
      this.pool = this.config.connectionString
        ? mysql.createPool(this.config.connectionString)
        : mysql.createPool({
            host: this.config.host || 'localhost',
            port: this.config.port || 3306,
            database: this.config.database || 'sockr',
            user: this.config.user,
            password: this.config.password,
          });
      this.ownPool = true;
    }

    if (this.autoMigrate) {
      await this.migrate();
    }
  }

  private async migrate(): Promise<void> {
    const { t } = this;
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS ${t.messages} (
        id              VARCHAR(36) PRIMARY KEY,
        conversation_id VARCHAR(255) NOT NULL,
        \`from\`        VARCHAR(255) NOT NULL,
        \`to\`          VARCHAR(255),
        group_id        VARCHAR(255),
        content         TEXT NOT NULL,
        timestamp       BIGINT NOT NULL,
        metadata        JSON,
        delivered_to    JSON NOT NULL DEFAULT (JSON_ARRAY()),
        read_by         JSON NOT NULL DEFAULT (JSON_ARRAY()),
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conv_ts (conversation_id, timestamp DESC),
        INDEX idx_to (\`to\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS ${t.groups} (
        id          VARCHAR(36) PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        created_by  VARCHAR(255) NOT NULL,
        created_at  BIGINT NOT NULL,
        members     JSON NOT NULL DEFAULT (JSON_ARRAY()),
        metadata    JSON,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS ${t.groupMembers} (
        group_id    VARCHAR(36) NOT NULL,
        user_id     VARCHAR(255) NOT NULL,
        role        ENUM('admin','member') NOT NULL DEFAULT 'member',
        joined_at   BIGINT NOT NULL,
        PRIMARY KEY (group_id, user_id),
        FOREIGN KEY (group_id) REFERENCES ${t.groups}(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  private ensureConnected(): void {
    if (!this.pool) {
      throw new Error('[Sockr] MySQLMessageStore not connected.');
    }
  }

  async saveMessage(message: PersistedMessage): Promise<PersistedMessage> {
    this.ensureConnected();
    await this.pool.execute(
      `INSERT INTO ${this.t.messages}
         (id, conversation_id, \`from\`, \`to\`, group_id, content, timestamp, metadata, delivered_to, read_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         delivered_to = VALUES(delivered_to),
         read_by = VALUES(read_by)`,
      [
        message.id, message.conversationId, message.from,
        message.to || null, message.groupId || null, message.content,
        message.timestamp,
        message.metadata ? JSON.stringify(message.metadata) : null,
        JSON.stringify(message.deliveredTo),
        JSON.stringify(message.readBy),
      ]
    );
    return message;
  }

  async getMessage(messageId: string): Promise<PersistedMessage | null> {
    this.ensureConnected();
    const [rows]: any = await this.pool.execute(
      `SELECT * FROM ${this.t.messages} WHERE id = ?`, [messageId]
    );
    return rows[0] ? this.rowToMessage(rows[0]) : null;
  }

  async getMessages(
    conversationId: string,
    opts: PaginationOpts
  ): Promise<PersistedMessage[]> {
    this.ensureConnected();
    const conditions = ['conversation_id = ?'];
    const params: any[] = [conversationId];
    if (opts.before) { conditions.push('timestamp < ?'); params.push(opts.before); }
    if (opts.after) { conditions.push('timestamp > ?'); params.push(opts.after); }
    params.push(opts.limit);

    const [rows]: any = await this.pool.execute(
      `SELECT * FROM (
         SELECT * FROM ${this.t.messages}
         WHERE ${conditions.join(' AND ')}
         ORDER BY timestamp DESC LIMIT ?
       ) sub ORDER BY timestamp ASC`,
      params
    );
    return rows.map(this.rowToMessage.bind(this));
  }

  async getUndeliveredMessages(userId: string): Promise<PersistedMessage[]> {
    this.ensureConnected();
    const [rows]: any = await this.pool.execute(
      `SELECT * FROM ${this.t.messages}
       WHERE (\`to\` = ? AND NOT JSON_CONTAINS(delivered_to, JSON_QUOTE(?)))
       ORDER BY timestamp ASC`,
      [userId, userId]
    );
    return rows.map(this.rowToMessage.bind(this));
  }

  async markDelivered(messageId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await this.pool.execute(
      `UPDATE ${this.t.messages}
       SET delivered_to = JSON_ARRAY_APPEND(delivered_to, '$', ?)
       WHERE id = ? AND NOT JSON_CONTAINS(delivered_to, JSON_QUOTE(?))`,
      [userId, messageId, userId]
    );
  }

  async markRead(messageId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await this.pool.execute(
      `UPDATE ${this.t.messages}
       SET read_by = JSON_ARRAY_APPEND(read_by, '$', ?)
       WHERE id = ? AND NOT JSON_CONTAINS(read_by, JSON_QUOTE(?))`,
      [userId, messageId, userId]
    );
  }

  async saveGroup(group: Group): Promise<Group> {
    this.ensureConnected();
    await this.pool.execute(
      `INSERT INTO ${this.t.groups} (id, name, created_by, created_at, members, metadata)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), metadata=VALUES(metadata)`,
      [
        group.id, group.name, group.createdBy, group.createdAt,
        JSON.stringify(group.members),
        group.metadata ? JSON.stringify(group.metadata) : null,
      ]
    );
    return group;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    this.ensureConnected();
    const [rows]: any = await this.pool.execute(
      `SELECT * FROM ${this.t.groups} WHERE id = ?`, [groupId]
    );
    return rows[0] ? this.rowToGroup(rows[0]) : null;
  }

  async updateGroup(
    groupId: string,
    updates: Partial<Pick<Group, 'name' | 'metadata'>>
  ): Promise<Group> {
    this.ensureConnected();
    const sets: string[] = [];
    const params: any[] = [];
    if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name); }
    if (updates.metadata !== undefined) { sets.push('metadata = ?'); params.push(JSON.stringify(updates.metadata)); }
    params.push(groupId);
    await this.pool.execute(
      `UPDATE ${this.t.groups} SET ${sets.join(', ')} WHERE id = ?`, params
    );
    const group = await this.getGroup(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    return group;
  }

  async deleteGroup(groupId: string): Promise<void> {
    this.ensureConnected();
    await Promise.all([
      this.pool.execute(`DELETE FROM ${this.t.groups} WHERE id = ?`, [groupId]),
      this.pool.execute(`DELETE FROM ${this.t.messages} WHERE group_id = ?`, [groupId]),
    ]);
  }

  async addGroupMember(groupId: string, member: GroupMember): Promise<void> {
    this.ensureConnected();
    await this.pool.execute(
      `INSERT INTO ${this.t.groupMembers} (group_id, user_id, role, joined_at)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE role=VALUES(role)`,
      [groupId, member.userId, member.role, member.joinedAt]
    );
    // Keep members JSON array in sync on the group row
    await this.pool.execute(
      `UPDATE ${this.t.groups}
       SET members = IF(
         JSON_CONTAINS(members, JSON_QUOTE(?)),
         members,
         JSON_ARRAY_APPEND(members, '$', ?)
       )
       WHERE id = ?`,
      [member.userId, member.userId, groupId]
    );
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await this.pool.execute(
      `DELETE FROM ${this.t.groupMembers} WHERE group_id=? AND user_id=?`,
      [groupId, userId]
    );
    // MySQL doesn't have array_remove, so re-fetch and update
    const group = await this.getGroup(groupId);
    if (group) {
      const members = group.members.filter((id) => id !== userId);
      await this.pool.execute(
        `UPDATE ${this.t.groups} SET members=? WHERE id=?`,
        [JSON.stringify(members), groupId]
      );
    }
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    this.ensureConnected();
    const [rows]: any = await this.pool.execute(
      `SELECT * FROM ${this.t.groupMembers} WHERE group_id = ?`, [groupId]
    );
    return rows.map((r: any) => ({
      userId: r.user_id,
      role: r.role,
      joinedAt: Number(r.joined_at),
    }));
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    this.ensureConnected();
    const [rows]: any = await this.pool.execute(
      `SELECT * FROM ${this.t.groups}
       WHERE JSON_CONTAINS(members, JSON_QUOTE(?))`,
      [userId]
    );
    return rows.map(this.rowToGroup.bind(this));
  }

  private rowToMessage(row: any): PersistedMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      from: row.from,
      to: row.to || undefined,
      groupId: row.group_id || undefined,
      content: row.content,
      timestamp: Number(row.timestamp),
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      deliveredTo: typeof row.delivered_to === 'string' ? JSON.parse(row.delivered_to) : row.delivered_to || [],
      readBy: typeof row.read_by === 'string' ? JSON.parse(row.read_by) : row.read_by || [],
    };
  }

  private rowToGroup(row: any): Group {
    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: Number(row.created_at),
      members: typeof row.members === 'string' ? JSON.parse(row.members) : row.members || [],
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    };
  }

  async disconnect(): Promise<void> {
    if (this.pool && this.ownPool) {
      await this.pool.end();
    }
  }
}