/**
 * Create the demo organization ("Demo Chocolate Plant") with sample materials, recipes, plans,
 * purchase orders and four people — areyes (owner), msilva, tokafor (Warehouse), pnair (Production) —
 * all with the password demo1234 (or the one given).
 *   npm run db:seed-demo [-- <password>]
 */
import { getDb } from '@/db';
import { createDemoOrganization } from '@/db/seed';

getDb()
  .then((db) => createDemoOrganization(db, process.argv[2] || undefined))
  .then((id) => {
    console.log(id ? 'Demo organization created. Sign in as areyes / msilva / pnair.' : 'Demo accounts already exist; nothing changed.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
