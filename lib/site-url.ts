/**
 * The public address of the site, used to build absolute URLs for link previews.
 * Set APP_URL to override; on Vercel the production domain is detected automatically.
 */
export function siteUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return /^https?:\/\//.test(explicit) ? explicit : `https://${explicit}`;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
