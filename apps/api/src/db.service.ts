import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';

// DATE columns come back as 'YYYY-MM-DD' strings instead of Date objects, so no machine timezone can shift them.
types.setTypeParser(types.builtins.DATE, (value) => value);

// Add new tables here as extra statements; they are all created once, behind a lock.
// Order matters: a table must come after any table it references.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, title TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())',
  `CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    number INT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog'
      CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium'
      CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assignee_id INT REFERENCES members (id) ON DELETE SET NULL,
    due_on DATE,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, number)
  )`,
  'CREATE INDEX IF NOT EXISTS tasks_board_idx ON tasks (project_id, status, position)',
  `CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    member_id INT NOT NULL REFERENCES members (id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    task_id INT REFERENCES tasks (id) ON DELETE SET NULL,
    member_id INT REFERENCES members (id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS activity_project_idx ON activity (project_id, created_at DESC)',
];

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
    : null;
  private ready: Promise<void> | null = null;

  get enabled(): boolean {
    return this.pool !== null;
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.pool) throw new Error('DATABASE_URL is not set');
    await this.ensureSchema();
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  // Runs fn on one connection inside BEGIN/COMMIT. Any error rolls back and is rethrown.
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('DATABASE_URL is not set');
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  private ensureSchema(): Promise<void> {
    this.ready ??= (async () => {
      // Concurrent instances (serverless cold starts, parallel test files) race on CREATE TABLE IF NOT EXISTS,
      // so serialize schema setup behind a transaction-scoped advisory lock.
      const client = await this.pool!.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(727274)');
        for (const statement of SCHEMA) await client.query(statement);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        this.ready = null;
        throw err;
      } finally {
        client.release();
      }
    })();
    return this.ready;
  }
}
