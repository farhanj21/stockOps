import { count, inArray } from 'drizzle-orm';
import { seed as starterData } from '@/lib/seed';
import { hashPassword } from '@/server/password';
import type { Db } from './index';
import * as t from './schema';

/** Starter-account password outside production, unless SEED_PASSWORD overrides it. */
export const DEFAULT_DEMO_PASSWORD = 'demo1234';

export const isProduction = () => process.env.NODE_ENV === 'production';

/** Demo conveniences (demo account buttons, "Reset demo data") are on in development, opt-in in production. */
export const demoMode = () => (process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : !isProduction());

function seedPassword(): string | null {
  return process.env.SEED_PASSWORD || (isProduction() ? null : DEFAULT_DEMO_PASSWORD);
}

const n = (v: number | '') => (v === '' ? 0 : v);

/** Tables cleared by a demo reset, children before parents. Users and sessions survive it. */
const CONTENT_TABLES = [t.stockMovements, t.poLines, t.purchaseOrders, t.productionRuns, t.forecasts, t.recipeLines, t.products, t.ingredients, t.accessRequests];

/** Materials, recipes, plans, POs and access requests from the plant's spreadsheet. */
async function insertContent(db: Db, passwordHash: string) {
  const d = starterData();
  const userIdByName = new Map(d.users.map((u) => [u.name, u.id]));
  await db.transaction(async (tx) => {
    await tx.insert(t.ingredients).values(
      d.ingredients.map((i, position) => ({ ...i, cost: n(i.cost), pack: n(i.pack), par: n(i.par), inHand: n(i.inHand), pipeline: n(i.pipeline), position })),
    );
    await tx.insert(t.products).values(
      d.products.map((p, position) => ({ id: p.id, name: p.name, batchKg: n(p.batchKg), unitsPerBatch: n(p.upb), unitsPerCase: n(p.upc), position })),
    );
    await tx.insert(t.recipeLines).values(
      Object.entries(d.recipes).flatMap(([productId, lines]) => lines.map((l, position) => ({ productId, ingredientId: l.ing, qtyPerBatch: n(l.qty), position }))),
    );
    await tx.insert(t.forecasts).values(
      d.forecasts.map((f) => ({ id: f.id, productId: f.productId, batches: f.batches, targetDate: f.date, createdBy: userIdByName.get(f.by) ?? null })),
    );
    for (const po of d.pos) {
      const by = userIdByName.get(po.by) ?? null;
      await tx.insert(t.purchaseOrders).values({
        id: po.id,
        status: po.status,
        placedOn: po.date,
        receivedOn: po.received ?? null,
        createdBy: by,
        receivedBy: po.status === 'Received' ? by : null,
      });
      await tx.insert(t.poLines).values(po.lines.map((l, position) => ({ poId: po.id, ingredientId: l.ing, packs: l.packs, qty: l.qty, position })));
    }
    await tx.insert(t.accessRequests).values(d.requests.map((r) => ({ ...r, passwordHash, createdAt: new Date(r.date + 'T09:00:00') })));
  });
}

/** Starter accounts (Admin, two Warehouse, one Production) plus all starter content. */
export async function seedDatabase(db: Db, password: string) {
  const passwordHash = await hashPassword(password);
  await db.insert(t.users).values(starterData().users.map((u) => ({ ...u, passwordHash })));
  await insertContent(db, passwordHash);
}

/** Seed a brand-new database. In production this needs SEED_PASSWORD so nobody ships with the demo password. */
export async function seedIfEmpty(db: Db) {
  const [{ value }] = await db.select({ value: count() }).from(t.users);
  if (value > 0) return;
  const password = seedPassword();
  if (!password) {
    console.warn('[stockops] Database is empty. Set SEED_PASSWORD and restart to create the starter accounts.');
    return;
  }
  await seedDatabase(db, password);
}

/** Demo mode: put every material, recipe, plan and PO back to the starter data. Accounts are kept. */
export async function resetContent(db: Db) {
  await db.transaction(async (tx) => {
    for (const table of CONTENT_TABLES) await tx.delete(table);
  });
  const starterIds = starterData().users.map((u) => u.id);
  const present = await db.select({ id: t.users.id }).from(t.users).where(inArray(t.users.id, starterIds));
  if (present.length !== starterIds.length) throw new Error('Starter accounts are missing; reset needs a fresh database.');
  await insertContent(db, await hashPassword(seedPassword() ?? DEFAULT_DEMO_PASSWORD));
}
