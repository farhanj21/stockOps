/**
 * Create or update the database tables (and seed an empty database), then exit.
 * The app also does this on first use; run it explicitly as a deploy step if you prefer.
 *   npm run db:migrate
 */
import { getDb } from '@/db';

getDb()
  .then(() => {
    console.log('Database is up to date.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
