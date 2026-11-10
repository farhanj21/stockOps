/** A numeric field that may be blank while the user is mid-edit. */
export type Num = number | '';

import type { Perms } from './roles';

/** The built-in roles. Organizations can add their own (see RoleDef). */
export type Role = 'Admin' | 'Warehouse' | 'Production';

/** A role people can be given: built-in (id = its name) or custom (id like `role_x1y2`). */
export interface RoleDef {
  id: string;
  name: string;
  builtIn: boolean;
  perms: Perms;
}
export const MATERIAL_KINDS = ['ingredient', 'packaging', 'utility'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  kind: MaterialKind;
  cost: Num;
  pack: Num;
  packName: string;
  par: Num;
  inHand: Num;
  pipeline: Num;
}

export interface Product {
  id: string;
  name: string;
  batchKg: Num;
  upb: Num;
  upc: Num;
  /** Grams per unit, entered in Setup ('' when not set). */
  unitG: Num;
}

export interface RecipeLine {
  ing: string;
  qty: Num;
}

export interface Forecast {
  id: string;
  productId: string;
  batches: number;
  date: string;
  by: string;
}

/** One batch actually produced, recorded by Production. */
export interface Batch {
  id: string;
  batchNo: string;
  /** YYYY-MM-DD */
  date: string;
  productId: string;
  forecastId: string | null;
  /** Recipe batch weight when it was made. */
  plannedKg: number;
  /** Recipe units per batch and units per case when it was made (0 on very old records). */
  plannedUnits: number;
  upc: number;
  /** Unit weight (g) used to work out kg produced (0 on very old records). */
  unitG: number;
  /** Units × unit weight (planned kg ÷ planned units). */
  actualKg: number;
  /** Total units made: full cases × units per case + loose units. */
  units: number;
  /** Full cases packed. */
  cases: number;
  /** Recipe × material prices at the time it was logged. */
  materialCost: number;
  notes: string;
  by: string;
}

export interface PoLine {
  ing: string;
  packs: number;
  /** Quantity requested (packs × pack size). */
  qty: number;
  /** Set once this item has been received: what actually arrived, when, by whom, and any note. */
  received?: { qty: number; date: string; by: string; note: string };
}

/** A purchase request (stored as a purchase order). It closes ("Received") once every item is received. */
export interface PurchaseOrder {
  id: string;
  date: string;
  status: 'Open' | 'Received';
  received?: string;
  /** Who marked it received. */
  receivedBy?: string;
  by: string;
  lines: PoLine[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  /** Built-in role name or custom role id. */
  roleId: string;
  /** Role name to show. */
  role: string;
  isOwner: boolean;
}

export interface Data {
  ingredients: Ingredient[];
  products: Product[];
  recipes: Record<string, RecipeLine[]>;
  forecasts: Forecast[];
  pos: PurchaseOrder[];
  /** Highest PO number ever used, deleted orders included (0 if unknown). */
  lastPoNo?: number;
  users: User[];
  batches: Batch[];
  /** Built-in roles first, then the organization's custom roles. */
  roles: RoleDef[];
  /** Latest stock count, adjustment, import or delivery received (ISO time), or null if never. */
  lastStockUpdate?: { at: string; by: string } | null;
}

export interface Organization {
  id: string;
  name: string;
  /** Where the uploaded logo is served from, or null to show the StockOps mark. */
  logoUrl: string | null;
}
