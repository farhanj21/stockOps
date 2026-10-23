/** A numeric field that may be blank while the user is mid-edit. */
export type Num = number | '';

export type Role = 'Admin' | 'Warehouse' | 'Production';
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
  actualKg: number;
  units: number;
  cases: number;
  /** Recipe × material prices at the time it was logged. */
  materialCost: number;
  notes: string;
  by: string;
}

export interface PoLine {
  ing: string;
  packs: number;
  qty: number;
}

export interface PurchaseOrder {
  id: string;
  date: string;
  status: 'Open' | 'Received';
  received?: string;
  by: string;
  lines: PoLine[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  isOwner: boolean;
}

export interface Data {
  ingredients: Ingredient[];
  products: Product[];
  recipes: Record<string, RecipeLine[]>;
  forecasts: Forecast[];
  pos: PurchaseOrder[];
  users: User[];
  batches: Batch[];
}

export interface Organization {
  id: string;
  name: string;
  /** Where the uploaded logo is served from, or null to show the StockOps mark. */
  logoUrl: string | null;
}
