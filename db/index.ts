/**
 * Database connection.
 *
 * - `DATABASE_URL` set → any PostgreSQL server (Supabase, Neon, RDS, local Postgres).
 * - Not set → PGlite, an embedded Postgres stored in `.data/pglite`, so the app runs with zero setup.
 *
 * Migrations in /drizzle run automatically on first use; an empty database is seeded (see db/seed.ts).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';
import { seedIfEmpty } from './seed';

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
  await seedIfEmpty(db);
  return db;
}

// One connection per server process, surviving dev hot reloads.
const globalForDb = globalThis as unknown as { __stockopsDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__stockopsDb ??= init().catch((err) => {
    globalForDb.__stockopsDb = undefined;
    throw err;
  });
  return globalForDb.__stockopsDb;
}

export { schema };
