/** Shapes exchanged between the browser and the server. */
import type { Perms } from './roles';
import type { Data, Organization } from './types';

export interface Me {
  userId: string;
  org: Organization;
  isOwner: boolean;
  /** Role name to show. */
  role: string;
  /** Built-in role name or custom role id. */
  roleId: string;
  /** What this person may change (the server enforces the same). */
  perms: Perms;
  /** Demo conveniences (sign-in shortcuts for the demo organization) are on. */
  demo: boolean;
  /** The owner can load the sample plant ("Load sample data"): always in development. */
  sampleData: boolean;
}

export interface Snapshot {
  data: Data;
  me: Me;
}

export type ActionResult<T = null> =
  | { ok: true; snapshot: Snapshot | null; value: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; signedOut?: boolean };

export interface SessionInfo {
  signedIn: boolean;
  demo: boolean;
  /** Only in demo mode, when the demo organization exists: one account per role, for the sign-in shortcuts. */
  demoAccounts: { username: string; label: string }[];
  demoPassword: string | null;
}

/** What to send back to undo a spreadsheet import. */
export interface ImportUndo {
  restore: { id: string; fields: Partial<Record<'cost' | 'pack' | 'par' | 'inHand' | 'pipeline', number>> }[];
  remove: string[];
}
