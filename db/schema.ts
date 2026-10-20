/**
 * StockOps database schema (PostgreSQL), following the inventory-control blueprint:
 * RBAC users, materials with pack sizes and par levels, products with per-batch recipes,
 * production forecasts and runs, purchase orders, and an audit trail of every stock change.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['Admin', 'Warehouse', 'Production']);
export const materialKindEnum = pgEnum('material_kind', ['ingredient', 'packaging', 'utility']);
export const poStatusEnum = pgEnum('po_status', ['Open', 'Received']);
export const requestStatusEnum = pgEnum('request_status', ['pending', 'approved', 'declined']);
export const stockFieldEnum = pgEnum('stock_field', ['in_hand', 'pipeline']);
export const movementReasonEnum = pgEnum('movement_reason', ['count', 'adjust', 'import', 'po_created', 'po_received', 'production_run']);

const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ── People & access ─────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token; the token itself is never stored. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Admins may preview the app as another role. Never grants more than the user's own role. */
    viewRole: roleEnum('view_role'),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const accessRequests = pgTable('access_requests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: roleEnum('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  status: requestStatusEnum('status').notNull().default('pending'),
  decidedBy: text('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
});

// ── Materials, products, recipes ────────────────────────────────────────────

export const ingredients = pgTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    unit: text('unit').notNull().default('kg'),
    kind: materialKindEnum('kind').notNull().default('ingredient'),
    cost: numeric('cost', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    /** Supplier pack size in `unit` (25 kg bag, 200 kg drum…). Orders round up to whole packs. */
    pack: qty('pack').notNull(),
    packName: text('pack_name').notNull().default('bag'),
    par: qty('par').notNull().default(0),
    inHand: qty('in_hand').notNull().default(0),
    pipeline: qty('pipeline').notNull().default(0),
    position: integer('position').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('ingredients_non_negative', sql`${t.cost} >= 0 and ${t.par} >= 0 and ${t.inHand} >= 0 and ${t.pipeline} >= 0`),
    check('ingredients_pack_positive', sql`${t.pack} > 0`),
  ],
);

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  batchKg: qty('batch_kg').notNull(),
  unitsPerBatch: integer('units_per_batch').notNull(),
  unitsPerCase: integer('units_per_case').notNull(),
  position: integer('position').notNull().default(0),
});

/** Bill of materials: absolute quantity per batch. Mix % is derived as qty ÷ batch weight. */
export const recipeLines = pgTable(
  'recipe_lines',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    qtyPerBatch: qty('qty_per_batch').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.ingredientId] }), check('recipe_qty_non_negative', sql`${t.qtyPerBatch} >= 0`)],
);

// ── Production ──────────────────────────────────────────────────────────────

export const forecasts = pgTable(
  'production_forecasts',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    /** Batches still to run; logging a run counts it down. */
    batches: integer('batches').notNull(),
    targetDate: date('target_date', { mode: 'string' }).notNull(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [check('forecast_batches_non_negative', sql`${t.batches} >= 0`)],
);

export const productionRuns = pgTable('production_runs', {
  id: serial('id').primaryKey(),
  forecastId: text('forecast_id').references(() => forecasts.id, { onDelete: 'set null' }),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  batches: integer('batches').notNull(),
  runBy: text('run_by').references(() => users.id),
  createdAt: createdAt(),
});

// ── Purchasing ──────────────────────────────────────────────────────────────

export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey(),
  status: poStatusEnum('status').notNull().default('Open'),
  placedOn: date('placed_on', { mode: 'string' }).notNull(),
  receivedOn: date('received_on', { mode: 'string' }),
  createdBy: text('created_by').references(() => users.id),
  receivedBy: text('received_by').references(() => users.id),
  createdAt: createdAt(),
});

export const poLines = pgTable(
  'po_lines',
  {
    poId: text('po_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    packs: integer('packs').notNull(),
    qty: qty('qty').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.poId, t.ingredientId] })],
);

// ── Audit trail ─────────────────────────────────────────────────────────────

/** One row per change to in-hand or pipeline stock: who, why, by how much. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: serial('id').primaryKey(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    field: stockFieldEnum('field').notNull(),
    delta: qty('delta').notNull(),
    balanceAfter: qty('balance_after').notNull(),
    reason: movementReasonEnum('reason').notNull(),
    /** PO id, forecast id or import file name. */
    ref: text('ref'),
    userId: text('user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('stock_movements_ingredient_idx').on(t.ingredientId, t.createdAt)],
);
