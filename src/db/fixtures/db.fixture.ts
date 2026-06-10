// File: src/db/fixtures/db.fixture.ts

import { test as base, expect } from '@playwright/test';
import { Pool } from 'pg';
import { resolveSecret } from '@utils/crypto-utils';

type DbFixtures = {
  /** Live pg.Pool; auto-ended after each test */
  db: Pool;
};

export const test = base.extend<DbFixtures>({
  db: async ({}, use) => {
    const host     = process.env.DB_HOST;
    const database = process.env.DB_NAME;
    const user     = process.env.DB_USER;
    const rawPwd   = process.env.DB_PASSWORD;
    const port     = parseInt(process.env.DB_PORT ?? '5432', 10);

    if (!host)     throw new Error('[db] DB_HOST is not set.');
    if (!database) throw new Error('[db] DB_NAME is not set.');
    if (!user)     throw new Error('[db] DB_USER is not set.');
    if (!rawPwd)   throw new Error('[db] DB_PASSWORD is not set.');

    const pool = new Pool({
      host,
      port,
      database,
      user,
      password: resolveSecret(rawPwd),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err: Error) => {
      console.error('[db] Pool error:', err.message);
    });

    await use(pool);
    await pool.end();
  },
});

export { expect };
