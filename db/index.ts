/**
 * Database connection.
 *
 * - `DATABASE_URL` set → any PostgreSQL server (Supabase, Neon, RDS, local Postgres).
 * - Not set → PGlite, an embedded Postgres stored in `.data/pglite`, so the app runs with zero setup.
 *
 * Migrations in /drizzle run automatically on first use. A new database starts empty: the first
 * visitor creates an organization (see `npm run db:seed-demo` for a ready-made demo one).
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.join(process.cwd(), 'drizzle');

/** In-process Postgres. Pass nothing for an in-memory database (tests). */
export async function openPglite(dataDir?: string) {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}

async function openPostgres(url: string) {
  const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 5), prepare: false });
  const db = drizzlePostgres(client, { schema });
  await migratePostgres(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.end() };
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const { db } = url ? await openPostgres(url) : await openPglite(process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite'));
  return db;
}

// One connection per server process, surviving dev hot reloads.
const globalForDb = globalThis as unknown as { __stockopsDb?: Promise<Db>; __stockopsJournal?: number };

const journalStamp = () => {
  try {
    return statSync(path.join(migrationsFolder, 'meta', '_journal.json')).mtimeMs;
  } catch {
    return 0;
  }
};

/** Development: apply migrations added while `next dev` is running, on the open connection. */
async function migrateOpenDb(db: Db) {
  try {
    if (process.env.DATABASE_URL) await migratePostgres(db as never, { migrationsFolder });
    else await migratePglite(db as never, { migrationsFolder });
    console.log('[stockops] applied new database migrations');
  } catch (e) {
    console.error('[stockops] migration failed', e);
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__stockopsDb) {
    globalForDb.__stockopsJournal = journalStamp();
    globalForDb.__stockopsDb = init().catch((err) => {
      globalForDb.__stockopsDb = undefined;
      throw err;
    });
  } else if (process.env.NODE_ENV !== 'production') {
    const stamp = journalStamp();
    if (stamp !== globalForDb.__stockopsJournal) {
      globalForDb.__stockopsJournal = stamp;
      globalForDb.__stockopsDb = globalForDb.__stockopsDb.then(migrateOpenDb);
    }
  }
  return globalForDb.__stockopsDb;
}

export { schema };
