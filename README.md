# StockOps

Production MRP and inventory control for the plant floor: stock counts, recipes, production forecasts and purchase orders, replacing the shared spreadsheet.

It's a responsive Next.js app that installs as a PWA. The mobile layout runs below 960px and the desktop layout (sidebar and top bar) at 960px and up. The UI is built from the Claude Design handoff (`StockOps Screens` / `StockOpsApp`).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production build (service worker only registers here)
```

Sign in with a demo account from the sign-in screen: **Admin · Ana**, **Warehouse · Marco** or **Production · Priya**. Any password of 6+ characters works. The account sheet (avatar, top right or bottom left) switches role and resets the demo data.

## Install on a phone

Serve the production build over HTTPS, open it, then:

- **iOS Safari:** Share → Add to Home Screen
- **Android Chrome:** ⋮ → Install app

It opens full screen with safe-area padding for notches and the home indicator. Once loaded it also works offline.

## How it's put together

| Path | What's there |
| --- | --- |
| `app/(auth)/` | Sign in, request access, reset password |
| `app/(app)/` | Dashboard `/`, `/stock`, `/plan`, `/orders`, `/setup`, behind a sign-in guard |
| `components/screens/` | One component per screen |
| `components/shell/` | Sidebar, top bar and search, mobile header, bottom tabs |
| `components/sheets/` | Detail sheets: material, recipe, log run, Excel import, account |
| `lib/model.ts` | All MRP math (see below) |
| `lib/store.ts` | Data and session (zustand, persisted to `localStorage`) |
| `lib/ui.ts` | Screen state that isn't saved: search, filters, open sheet, toast |
| `lib/importer.ts` | Excel/CSV import and template export (SheetJS) |
| `lib/roles.ts` | Role permissions |
| `styles/`, `app/globals.css` | Design tokens and styles. `.n-only` / `.w-only` switch mobile and desktop markup at 960px |

### MRP rules (`lib/model.ts`)

- **Total available** = in-hand + pipeline
- **Free stock** = total − what committed plans already need
- **Can produce** = min over recipe lines of (stock ÷ qty per batch), floored to whole batches, then converted to cases
- **Suggested order** = deficit vs the larger of plan need or par level, rounded **up** to whole supplier packs

### Roles

| | Admin | Warehouse | Production |
| --- | :-: | :-: | :-: |
| Users, recipes, costs, par levels, pack sizes | ✓ | | |
| Log stock, import stock sheets, receive deliveries | ✓ | ✓ | |
| Forecasts and production runs | ✓ | | ✓ |
| Alerts and purchase orders | ✓ | ✓ | ✓ |

## Data

Everything lives in the browser's `localStorage` under `stockops-v1`. Nothing is shared between devices or users. That matches the prototype. Moving to a real backend means swapping the store actions in `lib/store.ts` for API calls. The SQL schema in the original blueprint maps directly onto `lib/types.ts`.

Display options from the design (show costs, grouped vs tinted alerts) are in `lib/config.ts`.
