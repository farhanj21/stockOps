import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite loads its WebAssembly Postgres from its own package files, so keep it out of the bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Migrations run on first database use, so ship the SQL files with the server.
  outputFileTracingIncludes: { '/**': ['./drizzle/**/*'] },
};

export default nextConfig;
