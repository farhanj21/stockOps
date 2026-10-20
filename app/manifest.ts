import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'StockOps — Production MRP',
    short_name: 'StockOps',
    description: 'Stock counts, recipes, forecasts and purchase orders for the plant floor.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F6F4EF',
    theme_color: '#0F2038',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Stock', url: '/stock' },
      { name: 'Purchase orders', url: '/orders' },
    ],
  };
}
