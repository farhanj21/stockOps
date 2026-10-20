# StockOps

Production MRP and inventory control for the plant floor: stock counts, recipes, production forecasts and purchase orders, replacing the shared spreadsheet. It implements the *Inventory Control Blueprint*: in-hand + pipeline stock, recipe-based capacity, par-level alerts, forecasts, pack-rounded purchase orders, role-based access and Excel import.

- **App:** Next.js 16, responsive (phone layout below 960px, desktop at 960px and up), installable as a PWA
- **Backend:** Next.js Server Actions and API routes, PostgreSQL through Drizzle ORM, password sign-in with server-side sessions

## Run it on your computer

```bash
npm install
npm run dev            # http://localhost:3000
```

There's no database to install. Without `DATABASE_URL`, the app uses a built-in PostgreSQL (PGlite) stored in `.data/pglite`, creates the tables, and loads the starter data on first run.

Starter accounts, password `demo1234` in development (sign-in also shows one-tap buttons for these):

| Username | Role |
| --- | --- |
| `areyes` | Admin |
| `msilva`, `tokafor` | Warehouse |
| `pnair` | Production |

## Put it online (no server to manage)

1. **Database:** create a free PostgreSQL database on [Neon](https://neon.tech) or [Supabase](https://supabase.com) and copy its connection string.
2. **Hosting:** import this repository into [Vercel](https://vercel.com) and add these environment variables:
   - `DATABASE_URL`: the connection string from step 1
   - `SEED_PASSWORD`: the password the four starter accounts get when the database is first set up. Pick a strong one and change it later.
   - `PLANT_TIMEZONE`: e.g. `Asia/Karachi`, so PO and delivery dates follow plant time
3. Deploy. Tables are created and starter data loaded on the first visit.
4. On each phone, open the site and choose **Add to Home Screen** (iPhone) or **Install app** (Android).

All settings are listed in `.env.example`.

## Who can do what

The server enforces every rule below on every request. Hiding a button in the app is not what keeps people out.

| | Admin | Warehouse | Production |
| --- | :-: | :-: | :-: |
| Users, approving access requests | ✓ | | |
| Recipes, costs, mix %, par levels, pack sizes | ✓ | | |
| Log stock (in-hand and pipeline), import stock sheets, receive deliveries | ✓ | ✓ | |
| Forecasts and production runs | ✓ | | ✓ |
| Alerts and raising purchase orders | ✓ | ✓ | ✓ |

- **Previewing roles:** Admins can preview the app as another role from the account menu. It never grants more access than the account has.
- **New people:** they use **Request access** and choose a password. An Admin approves them under Setup → Users & access.
- **At least one Admin:** the app won't let you demote the last Admin.

## How the numbers work (`lib/mrp.ts`)

- **Total available** = in-hand + pipeline
- **Free stock** = total − what committed plans still need
- **Can produce now** = the smallest (stock ÷ quantity per batch) across the recipe, rounded down to whole batches, then converted to cases. Process water is ignored.
- **Suggested order** = the larger of the shortfall against plans or against par, rounded **up** to whole supplier packs (e.g. 5.6 kg short in 5 kg packs → 2 packs, 10 kg)

When a PO is raised, the server recomputes these numbers from live stock. Quantities are never taken from the phone.

## Behind the scenes

- **Stock history:** every change to in-hand or pipeline stock is recorded in `stock_movements`: who, when, why (count, ± adjust, import, PO raised, delivery received, production run) and the new balance.
- **Logging a production run:** deducts the recipe from in-hand stock and counts the plan down. It's refused if in-hand stock doesn't cover the run.
- **Receiving a PO:** moves its quantities from pipeline into in-hand, once.
- **Excel import:** the phone reads the sheet and shows a preview. The server re-matches the rows against live data and applies only what that role may change (Warehouse: counts only). Imports can be undone.
- **Several people at once:** the app saves each tap immediately and shows the change before the server confirms. It refreshes when reopened and every minute, so everyone sees the same stock.

## Code map

| Path | What's there |
| --- | --- |
| `db/schema.ts` | Tables: users, sessions, access requests, ingredients, products, recipe lines, forecasts, production runs, purchase orders and lines, stock movements |
| `drizzle/` | SQL migrations (generate new ones with `npm run db:generate` after changing the schema) |
| `db/index.ts`, `db/seed.ts` | Database connection (Postgres or PGlite), auto-migrate, starter data |
| `server/services.ts` | Every business rule and permission check |
| `server/session.ts`, `server/password.ts` | Sessions (httpOnly cookie, hashed token stored in the database) and scrypt password hashing |
| `app/actions.ts` | Server Actions: input validation (zod), session check, then the service |
| `app/api/snapshot`, `app/api/session` | Read endpoints for the app |
| `proxy.ts` | Sends signed-out visitors to sign-in |
| `lib/store.ts` | The app's copy of the data: instant updates, then reconciled with the server |
| `app/(app)`, `app/(auth)`, `components/` | Screens |
| `tests/` | Tests for the MRP math, permissions and every service, run against a real in-memory Postgres |

## Commands

```bash
npm run dev              # develop
npm run build && npm start
npm test                 # MRP + backend tests (Vitest)
npm run lint
npm run db:generate      # new migration after editing db/schema.ts
npm run db:migrate       # apply migrations / seed now (also happens automatically)
npm run user:password -- <username or email> <new password>   # reset someone's password and sign them out
```

## Not built yet

- **Password reset by email:** needs a mail provider (e.g. Resend or SES). For now the "Forgot password" screen tells people to ask their admin, who runs `npm run user:password`.
- **Push, email or WhatsApp alerts for below-par stock:** alerts show in the app today.
- **Limiting sign-in attempts:** worth adding before the app is reachable from the open internet.
