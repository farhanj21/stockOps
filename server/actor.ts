import { isAdminRole, NO_PERMS, PERMS, type Perms } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { AppError } from './errors';

/** The signed-in person a request acts for. */
export interface Actor {
  userId: string;
  organizationId: string;
  name: string;
  isOwner: boolean;
  /** Role name, for messages ("The Packer role can't …"). */
  role: string;
  /** Built-in role name or custom role id. */
  roleId: string;
  perms: Perms;
  sessionId: string;
}

/** Resolve a user row's permissions: their custom role if they have one, otherwise the built-in role. */
export function resolveRole(
  builtIn: Role,
  custom: { id: string; name: string; canStock: boolean; canReceive: boolean; canPlan: boolean; canSetup: boolean; canTeam: boolean; canCosts: boolean; canCalc: boolean } | null,
): Pick<Actor, 'role' | 'roleId' | 'perms'> {
  if (!custom) return { role: builtIn, roleId: builtIn, perms: PERMS[builtIn] ?? NO_PERMS };
  return {
    role: custom.name,
    roleId: custom.id,
    perms: { stock: custom.canStock, receive: custom.canReceive, plan: custom.canPlan, setup: custom.canSetup, team: custom.canTeam, costs: custom.canCosts, calc: custom.canCalc },
  };
}

const ACTION_LABEL: Record<keyof Perms, string> = {
  stock: 'change stock counts',
  plan: 'plan or log production',
  setup: 'change recipes, materials or users',
  receive: 'receive deliveries',
  team: 'manage the team or roles',
  costs: 'see costs',
  calc: 'use the batch calculator',
};

export const can = (actor: Actor, perm: keyof Perms) => actor.perms[perm];

export function requirePerm(actor: Actor, perm: keyof Perms) {
  if (!can(actor, perm)) throw new AppError(`The ${actor.role} role can't ${ACTION_LABEL[perm]}.`, 'forbidden');
}

/** A product's recipe and specs (batch size, units per batch, units per case) are part of the formula, so only the built-in Admin role changes them. */
export function requireAdmin(actor: Actor) {
  if (!isAdminRole(actor.roleId)) throw new AppError(`Only an Admin can change recipes, batch size or units. The ${actor.role} role can't.`, 'forbidden');
}

/** Plant-local calendar date (YYYY-MM-DD). Set PLANT_TIMEZONE, e.g. Asia/Karachi, when the server runs in UTC. */
export function plantToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.PLANT_TIMEZONE || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
