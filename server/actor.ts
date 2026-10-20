import { PERMS, type Perms } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { AppError } from './errors';

/** The signed-in person a request acts for. */
export interface Actor {
  userId: string;
  name: string;
  /** Effective role: the account's role, or the role an Admin is previewing. */
  role: Role;
  baseRole: Role;
  sessionId: string;
}

const ACTION_LABEL: Record<keyof Perms, string> = {
  stock: 'change stock counts',
  plan: 'plan or log production',
  setup: 'change recipes, materials or users',
  receive: 'receive deliveries',
};

export const can = (actor: Actor, perm: keyof Perms) => PERMS[actor.role][perm];

export function requirePerm(actor: Actor, perm: keyof Perms) {
  if (!can(actor, perm)) throw new AppError(`The ${actor.role} role can't ${ACTION_LABEL[perm]}.`, 'forbidden');
}

/** Plant-local calendar date (YYYY-MM-DD). Set PLANT_TIMEZONE, e.g. Asia/Karachi, when the server runs in UTC. */
export function plantToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.PLANT_TIMEZONE || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
