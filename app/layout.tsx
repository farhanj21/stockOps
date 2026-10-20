import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Hanken_Grotesk, Marcellus } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';
import '@/styles/shell.css';
import '@/styles/auth.css';
import '@/styles/screens.css';
import '@/styles/sheet.css';

const sans = Hanken_Grotesk({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const serif = Marcellus({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: { default: 'StockOps', template: '%s · StockOps' },
  description: 'Production MRP & inventory control — stock counts, recipes, forecasts and purchase orders.',
  applicationName: 'StockOps',
  appleWebApp: { capable: true, title: 'StockOps', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0F2038',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        {children}
        <Providers />
      </body>
    </html>
  );
}
