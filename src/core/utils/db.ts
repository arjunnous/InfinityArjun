// File: utils/db.ts

import { Pool, PoolClient, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Pool singleton — created once, reused across the test session
// ---------------------------------------------------------------------------
let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) {
    return _pool;
  }

  const port = parseInt(process.env.DB_PORT ?? '5432', 10);

  _pool = new Pool({
    host: process.env.DB_HOST,
    port,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Reasonable defaults for a test runner
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _pool.on('error', (err: Error) => {
    console.error('[db] Unexpected pool error:', err.message);
  });

  return _pool;
}

// ---------------------------------------------------------------------------
// dbQuery — parameterized SELECT (or any SQL returning rows)
// ---------------------------------------------------------------------------

/**
 * Execute a parameterized SQL query and return typed rows.
 *
 * @example
 *   const rows = await dbQuery<{ id: number; name: string }>(
 *     'SELECT id, name FROM policies WHERE status = $1',
 *     ['ACTIVE'],
 *   );
 */
export async function dbQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  const pool = getPool();
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    const result: QueryResult<T> = await client.query<T>(sql, params as unknown[]);
    return result.rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[dbQuery] Query failed — ${message}\nSQL: ${sql}`);
  } finally {
    client?.release();
  }
}

// ---------------------------------------------------------------------------
// dbInsert — type-safe INSERT from a plain object
// ---------------------------------------------------------------------------

/**
 * Insert a single row into `table`.  Column names are derived from the keys
 * of `data`; values are passed as parameterised placeholders.
 *
 * @example
 *   await dbInsert('test_policies', { policy_number: 'POL-2024-000001', status: 'ACTIVE' });
 */
export async function dbInsert(
  table: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(data).length === 0) {
    throw new Error('[dbInsert] data object must contain at least one key-value pair.');
  }

  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  const pool = getPool();
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    await client.query(sql, values);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[dbInsert] Insert into "${table}" failed — ${message}\nSQL: ${sql}`);
  } finally {
    client?.release();
  }
}

// ---------------------------------------------------------------------------
// dbCleanup — DELETE test records matching a WHERE clause
// ---------------------------------------------------------------------------

/**
 * Remove test records from `table` that match `whereClause`.
 * Intended for use in afterEach / afterAll hooks.
 *
 * @example
 *   await dbCleanup('test_policies', 'policy_number = $1', ['POL-2024-000001']);
 */
export async function dbCleanup(
  table: string,
  whereClause: string,
  params: unknown[],
): Promise<void> {
  const sql = `DELETE FROM ${table} WHERE ${whereClause}`;

  const pool = getPool();
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    await client.query(sql, params as unknown[]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[dbCleanup] Cleanup of "${table}" failed — ${message}\nSQL: ${sql}`);
  } finally {
    client?.release();
  }
}

// ---------------------------------------------------------------------------
// closeDb — gracefully end the pool (call in globalTeardown)
// ---------------------------------------------------------------------------

/**
 * End the shared connection pool.  Call once in your Playwright globalTeardown.
 */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
