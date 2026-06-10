import { Pool, type QueryResultRow } from 'pg';
import { resolveSecret } from '@utils/crypto-utils';
import { requireEnv } from '@core/config/env'; // DB_PASSWORD only
import { config } from '@config/project.config';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  _pool = new Pool({
    host:     config.db.host,
    port:     config.db.port,
    database: config.db.name,
    user:     config.db.user,
    password: resolveSecret(requireEnv('DB_PASSWORD')),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _pool.on('error', (err: Error) => {
    console.error('[db] Pool error:', err.message);
  });

  return _pool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
