import type { IMessageStore } from 'sockr-shared';
import type { PersistedMessage, PaginationOpts } from 'sockr-shared';
import type { Group, GroupMember } from 'sockr-shared';

export interface PostgresMessageStoreConfig {
  /** Option A: full connection string */
  connectionString?: string;
  /** Option B: individual connection fields */
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | object;
  /** Option C: pass an existing pg.Pool — Sockr will not create a new one */
  pool?: any;
  /** Postgres schema to use. Defaults to 'public'. */
  schema?: string;
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
 * PostgreSQL implementation of IMessageStore.
 *
 * Requires pg to be installed:
 *   npm install pg
 *   npm install --save-dev @types/pg
 *
 * Usage:
 *   new SocketServer({
 *     providers: {
 *       messageStore: new PostgresMessageStore({
 *         connectionString: process.env.DATABASE_URL
 *       })
 *     }
 *   })
 *
 * Reuse an existing pool:
 *   new PostgresMessageStore({ pool: existingPool })
 */
export class PostgresMessageStore implements IMessageStore {
  private pool: any = null;
  private pg: any = null;
  private ownPool: boolean = false;
  private schema: string;
  private p: string; // table prefix
  private autoMigrate: boolean;
  private config: PostgresMessageStoreConfig;

  constructor(config: PostgresMessageStoreConfig) {
    this.config = config;
    this.schema = config.schema || 'public';
    this.p = config.tablePrefix ?? 'sockr_';
    this.autoMigrate = config.autoMigrate ?? true;
  }

  private get t() {
    return {
      messages: `"${this.schema}"."${this.p}messages"`,
      groups: `"${this.schema}"."${this.p}groups"`,
      groupMembers: `"${this.schema}"."${this.p}group_members"`,
    };
  }

  private async getPg(): Promise<any> {
    if (!this.pg) {
      try {
        this.pg = require('pg');
      } catch {
        throw new Error(
          '[Sockr] PostgresMessageStore requires pg to be installed.\n' +
          'Run: npm install pg'
        );
      }
    }
    return this.pg;
  }

  async connect(): Promise<void> {
    const pg = await this.getPg();

    if (this.config.pool) {
      this.pool = this.config.pool;
      this.ownPool = false;
    } else {
      this.pool = new pg.Pool(
        this.config.connectionString
          ? { connectionString: this.config.connectionString, ssl: this.config.ssl }
          : {
              host: this.config.host,
              port: this.config.port || 5432,
              database: this.config.database || 'sockr',
              user: this.config.user,
              password: this.config.password,
              ssl: this.config.ssl,
            }
      );
      this.ownPool = true;
    }

    if (this.autoMigrate) {
      await this.migrate();
    }
  }

  private async migrate(): Promise<void> {
    const { t } = this;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${t.messages} (
        id            TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        "from"        TEXT NOT NULL,
        "to"          TEXT,
        group_id      TEXT,
        content       TEXT NOT NULL,
        timestamp     BIGINT NOT NULL,
        metadata      JSONB,
        delivered_to  TEXT[] NOT NULL DEFAULT '{}',
        read_by       TEXT[] NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${this.p}msg_conv_ts
        ON ${t.messages} (conversation_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_${this.p}msg_to
        ON ${t.messages} ("to") WHERE "to" IS NOT NULL;

      CREATE TABLE IF NOT EXISTS ${t.groups} (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        created_at  BIGINT NOT NULL,
        members     TEXT[] NOT NULL DEFAULT '{}',
        metadata    JSONB,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${this.p}groups_members
        ON ${t.groups} USING GIN (members);

      CREATE TABLE IF NOT EXISTS ${t.groupMembers} (
        group_id    TEXT NOT NULL REFERENCES ${t.groups}(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'member',
        joined_at   BIGINT NOT NULL,
        PRIMARY KEY (group_id, user_id)
      );
    `);
  }

  private ensureConnected(): void {
    if (!this.pool) {
      throw new Error(
        '[Sockr] PostgresMessageStore not connected. ' +
        'Ensure SocketServer has initialized before handling connections.'
      );
    }
  }

  async saveMessage(message: PersistedMessage): Promise<PersistedMessage> {
    this.ensureConnected();
    await this.pool.query(
      `INSERT INTO ${this.t.messages}
        (id, conversation_id, "from", "to", group_id, content, timestamp, metadata, delivered_to, read_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         delivered_to = EXCLUDED.delivered_to,
         read_by = EXCLUDED.read_by`,
      [
        message.id,
        message.conversationId,
        message.from,
        message.to || null,
        message.groupId || null,
        message.content,
        message.timestamp,
        message.metadata ? JSON.stringify(message.metadata) : null,
        message.deliveredTo,
        message.readBy,
      ]
    );
    return message;
  }

  async getMessage(messageId: string): Promise<PersistedMessage | null> {
    this.ensureConnected();
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.t.messages} WHERE id = $1`, [messageId]
    );
    return rows[0] ? this.rowToMessage(rows[0]) : null;
  }

  async getMessages(
    conversationId: string,
    opts: PaginationOpts
  ): Promise<PersistedMessage[]> {
    this.ensureConnected();
    const conditions: string[] = ['conversation_id = $1'];
    const params: any[] = [conversationId];
    let i = 2;

    if (opts.before) { conditions.push(`timestamp < $${i++}`); params.push(opts.before); }
    if (opts.after) { conditions.push(`timestamp > $${i++}`); params.push(opts.after); }
    params.push(opts.limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM (
         SELECT * FROM ${this.t.messages}
         WHERE ${conditions.join(' AND ')}
         ORDER BY timestamp DESC
         LIMIT $${i}
       ) sub ORDER BY timestamp ASC`,
      params
    );
    return rows.map(this.rowToMessage);
  }

  async getUndeliveredMessages(userId: string): Promise<PersistedMessage[]> {
    this.ensureConnected();
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.t.messages}
       WHERE ("to" = $1 AND NOT ($1 = ANY(delivered_to)))
          OR (group_id IS NOT NULL AND NOT ($1 = ANY(delivered_to)) AND $1 = ANY(
                SELECT unnest(members) FROM ${this.t.groups} WHERE id = group_id
              ))
       ORDER BY timestamp ASC`,
      [userId]
    );
    return rows.map(this.rowToMessage);
  }

  async markDelivered(messageId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await this.pool.query(
      `UPDATE ${this.t.messages}
       SET delivered_to = array_append(delivered_to, $2)
       WHERE id = $1 AND NOT ($2 = ANY(delivered_to))`,
      [messageId, userId]
    );
  }

  async markRead(messageId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await this.pool.query(
      `UPDATE ${this.t.messages}
       SET read_by = array_append(read_by, $2)
       WHERE id = $1 AND NOT ($2 = ANY(read_by))`,
      [messageId, userId]
    );
  }

  async saveGroup(group: Group): Promise<Group> {
    this.ensureConnected();
    await this.pool.query(
      `INSERT INTO ${this.t.groups} (id, name, created_by, created_at, members, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, metadata=EXCLUDED.metadata`,
      [
        group.id, group.name, group.createdBy, group.createdAt,
        group.members,
        group.metadata ? JSON.stringify(group.metadata) : null,
      ]
    );
    return group;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    this.ensureConnected();
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.t.groups} WHERE id = $1`, [groupId]
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
    let i = 1;
    if (updates.name !== undefined) { sets.push(`name = $${i++}`); params.push(updates.name); }
    if (updates.metadata !== undefined) { sets.push(`metadata = $${i++}`); params.push(JSON.stringify(updates.metadata)); }
    params.push(groupId);
    const { rows } = await this.pool.query(
      `UPDATE ${this.t.groups} SET ${sets.join(', ')}, updated_at=NOW()
       WHERE id = $${i} RETURNING *`,
      params
    );
    if (!rows[0]) throw new Error(`Group ${groupId} not found`);
    return this.rowToGroup(rows[0]);
  }

  async deleteGroup(groupId: string): Promise<void> {
    this.ensureConnected();
    // group_members cascade via FK, messages deleted manually
    await Promise.all([
      this.pool.query(`DELETE FROM ${this.t.groups} WHERE id = $1`, [groupId]),
      this.pool.query(`DELETE FROM ${this.t.messages} WHERE group_id = $1`, [groupId]),
    ]);
  }

  async addGroupMember(groupId: string, member: GroupMember): Promise<void> {
    this.ensureConnected();
    await Promise.all([
      this.pool.query(
        `INSERT INTO ${this.t.groupMembers} (group_id, user_id, role, joined_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (group_id, user_id) DO UPDATE SET role=EXCLUDED.role`,
        [groupId, member.userId, member.role, member.joinedAt]
      ),
      this.pool.query(
        `UPDATE ${this.t.groups}
         SET members = array_append(members, $2)
         WHERE id = $1 AND NOT ($2 = ANY(members))`,
        [groupId, member.userId]
      ),
    ]);
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    this.ensureConnected();
    await Promise.all([
      this.pool.query(
        `DELETE FROM ${this.t.groupMembers} WHERE group_id=$1 AND user_id=$2`,
        [groupId, userId]
      ),
      this.pool.query(
        `UPDATE ${this.t.groups}
         SET members = array_remove(members, $2)
         WHERE id = $1`,
        [groupId, userId]
      ),
    ]);
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    this.ensureConnected();
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.t.groupMembers} WHERE group_id = $1`, [groupId]
    );
    return rows.map((r: any) => ({
      userId: r.user_id,
      role: r.role,
      joinedAt: Number(r.joined_at),
    }));
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    this.ensureConnected();
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.t.groups} WHERE $1 = ANY(members)`, [userId]
    );
    return rows.map(this.rowToGroup);
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
      metadata: row.metadata,
      deliveredTo: row.delivered_to || [],
      readBy: row.read_by || [],
    };
  }

  private rowToGroup(row: any): Group {
    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: Number(row.created_at),
      members: row.members || [],
      metadata: row.metadata,
    };
  }

  async disconnect(): Promise<void> {
    if (this.pool && this.ownPool) {
      await this.pool.end();
    }
  }
}