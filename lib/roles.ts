import type { Role } from './types';

export const ROLES: Role[] = ['Admin', 'Warehouse', 'Production'];

export interface Perms {
  /** Log in-hand / pipeline stock and import stock sheets. */
  stock: boolean;
  /** Forecast batches and log production runs. */
  plan: boolean;
  /** Recipes, materials, users. */
  setup: boolean;
  /** Mark purchase orders as received. */
  receive: boolean;
}

export const PERMS: Record<Role, Perms> = {
  Admin: { stock: true, plan: true, setup: true, receive: true },
  Warehouse: { stock: true, plan: false, setup: false, receive: true },
  Production: { stock: false, plan: true, setup: false, receive: false },
};

/** Demo user that each role switches to. */
export const ROLE_USER: Record<Role, string> = { Admin: 'u1', Warehouse: 'u2', Production: 'u3' };

export const ROLE_DESC: Record<Role, string> = {
  Admin: 'Recipes, par levels, pack sizes, users — full access.',
  Warehouse: 'Log in-hand and pipeline stock, receive deliveries, raise POs.',
  Production: 'Forecast batches, log runs, raise POs. Stock is view-only.',
};

export const DEMO_PASS = 'demo1234';
