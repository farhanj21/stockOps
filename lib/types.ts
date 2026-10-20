/** A numeric field that may be blank while the user is mid-edit. */
export type Num = number | '';

export type Role = 'Admin' | 'Warehouse' | 'Production';
export type MaterialKind = 'ingredient' | 'packaging' | 'utility';

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
}

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  role: Role;
  date: string;
}

export interface Data {
  ingredients: Ingredient[];
  products: Product[];
  recipes: Record<string, RecipeLine[]>;
  forecasts: Forecast[];
  pos: PurchaseOrder[];
  users: User[];
  requests: AccessRequest[];
}
