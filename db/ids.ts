import { randomBytes } from 'node:crypto';

/** Short random id with a readable prefix, e.g. `ing_k3x9q2m7d1a0`. */
export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
