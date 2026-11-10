import type { Role, RoleDef } from './types';

export const ROLES: Role[] = ['Admin', 'Warehouse', 'Production'];

/**
 * What a role may change. Everyone can view every screen, export, and raise purchase requests.
 */
export interface Perms {
  /** Log in-hand / pipeline stock and import stock sheets. */
  stock: boolean;
  /** Receive the items on purchase requests. */
  receive: boolean;
  /** Forecast batches and log production runs. */
  plan: boolean;
  /** Products, recipes, materials, costs and par levels. */
  setup: boolean;
  /** Team accounts, roles, organization name and logo. */
  team: boolean;
  /** See material costs (batch cost, cost per kg, cost per case). */
  costs: boolean;
  /** Batch calculator: scale a product's recipe to any batch size and export it. */
  calc: boolean;
}

export const PERM_KEYS: (keyof Perms)[] = ['stock', 'receive', 'plan', 'setup', 'team', 'costs', 'calc'];

/** Plain-language labels for the role editor and the "what each role can do" list. */
export const PERM_INFO: Record<keyof Perms, { label: string; desc: string }> = {
  stock: { label: 'Count stock', desc: 'Change in-hand and pipeline quantities, import stock sheets' },
  receive: { label: 'Receive deliveries', desc: 'Receive items on purchase requests, one by one' },
  plan: { label: 'Production', desc: 'Plan batches and log batches made' },
  setup: { label: 'Setup', desc: 'Products, recipes, materials, costs and par levels' },
  team: { label: 'Team & roles', desc: 'Add or remove people, change roles, organization name and logo' },
  costs: { label: 'See costs', desc: 'View material cost of batches, cost per kg and cost per case' },
  calc: { label: 'Batch calculator', desc: "Work out each material's quantity for any batch size, and export it" },
};

export const NO_PERMS: Perms = { stock: false, receive: false, plan: false, setup: false, team: false, costs: false, calc: false };

export const PERMS: Record<Role, Perms> = {
  Admin: { stock: true, receive: true, plan: true, setup: true, team: true, costs: true, calc: true },
  Warehouse: { stock: true, receive: true, plan: false, setup: false, team: false, costs: false, calc: false },
  Production: { stock: false, receive: false, plan: true, setup: false, team: false, costs: false, calc: true },
};

/** Recipes and product specs (batch size, unit weight, units per batch/case) are Admin-only, even for custom roles with Setup. */
export const isAdminRole = (roleId: string) => roleId === 'Admin';

export const isBuiltInRole = (id: string): id is Role => (ROLES as string[]).includes(id);

/** Built-in roles in the same shape as custom ones; their id is their name. */
export const BUILT_IN_ROLES: RoleDef[] = ROLES.map((r) => ({ id: r, name: r, builtIn: true, perms: PERMS[r] }));

/** Demo user that each role switches to. */
export const ROLE_USER: Record<Role, string> = { Admin: 'u1', Warehouse: 'u2', Production: 'u3' };

export const ROLE_DESC: Record<Role, string> = {
  Admin: 'Recipes, par levels, pack sizes, users — full access.',
  Warehouse: 'Log in-hand and pipeline stock, receive deliveries, raise requests.',
  Production: 'Forecast batches, log runs, raise requests. Stock is view-only.',
};

/** One line describing a role: the built-in blurb, or its permissions listed. */
export function roleSummary(r: RoleDef): string {
  if (r.builtIn && isBuiltInRole(r.id)) return ROLE_DESC[r.id];
  const on = PERM_KEYS.filter((k) => r.perms[k]).map((k) => PERM_INFO[k].label.toLowerCase());
  return on.length ? `${on.join(', ')}; raise requests.`.replace(/^./, (c) => c.toUpperCase()) : 'View only; can raise requests.';
}
