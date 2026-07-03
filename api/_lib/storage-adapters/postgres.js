import pg from "pg";

const { Pool } = pg;
const TABLE_NAME = "hermest_records";

let pool = null;
let initialized = false;

export function createPostgresStorageAdapter(options) {
  const { connectionString, assertCollection, assertSafeId } = options;

  return {
    id: "postgres-jsonb",
    kind: "durable-database",
    async listRecords(collection) {
      assertCollection(collection);
      const client = await postgres();
      const result = await client.query(
        `select record from ${TABLE_NAME}
          where collection = $1
          order by coalesce(updated_at, created_at) desc, id desc`,
        [collection]
      );
      return result.rows.map(row => row.record);
    },
    async getRecord(collection, id) {
      assertCollection(collection);
      assertSafeId(id);
      const client = await postgres();
      const result = await client.query(
        `select record from ${TABLE_NAME} where collection = $1 and id = $2 limit 1`,
        [collection, id]
      );
      return result.rows[0]?.record || null;
    },
    async saveRecord(collection, record) {
      assertCollection(collection);
      assertSafeId(record.id);
      const client = await postgres();
      await client.query(
        `insert into ${TABLE_NAME}
          (collection, id, workspace_id, owner_user_id, record, created_at, updated_at)
          values ($1, $2, $3, $4, $5::jsonb, coalesce($6::timestamptz, now()), coalesce($7::timestamptz, now()))
          on conflict (collection, id) do update set
            workspace_id = excluded.workspace_id,
            owner_user_id = excluded.owner_user_id,
            record = excluded.record,
            updated_at = excluded.updated_at`,
        [
          collection,
          record.id,
          text(record.workspaceId),
          text(record.ownerUserId),
          JSON.stringify(record),
          timestamp(record.createdAt),
          timestamp(record.updatedAt)
        ]
      );
      return record;
    },
    async deleteRecord(collection, id) {
      assertCollection(collection);
      assertSafeId(id);
      const client = await postgres();
      await client.query(`delete from ${TABLE_NAME} where collection = $1 and id = $2`, [collection, id]);
    }
  };

  async function postgres() {
    if (!pool) {
      pool = new Pool({
        connectionString,
        max: Number(process.env.HERMEST_PG_POOL_MAX || 4),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000
      });
    }

    if (!initialized) {
      await pool.query(`
        create table if not exists ${TABLE_NAME} (
          collection text not null,
          id text not null,
          workspace_id text,
          owner_user_id text,
          record jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (collection, id)
        )
      `);
      await pool.query(`create index if not exists hermest_records_workspace_updated_idx on ${TABLE_NAME} (collection, workspace_id, updated_at desc)`);
      initialized = true;
    }

    return pool;
  }
}

function text(value) {
  return String(value || "").slice(0, 120) || null;
}

function timestamp(value) {
  return value ? String(value) : null;
}
