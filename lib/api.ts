/** Shapes exchanged between the browser and the server. */
import type { Data, Role } from './types';

export interface Me {
  userId: string;
  /** The role the app is acting as (an Admin previewing another role gets that role). */
  role: Role;
  /** The account's real role. */
  baseRole: Role;
  /** Demo conveniences such as "Reset demo data" are available. */
  demo: boolean;
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
  /** Only in demo mode: one starter account per role, for the sign-in shortcuts. */
  demoAccounts: { username: string; label: string }[];
  demoPassword: string | null;
}

/** What to send back to undo a spreadsheet import. */
export interface ImportUndo {
  restore: { id: string; fields: Partial<Record<'cost' | 'pack' | 'par' | 'inHand' | 'pipeline', number>> }[];
  remove: string[];
}
