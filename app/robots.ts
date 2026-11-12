import type { MetadataRoute } from 'next';

/** Everything behind sign-in is private, so search engines only get the public sign-in pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: ['/signin', '/create-org'], disallow: '/' },
  };
}
