import type { Metadata } from 'next';
import { Stock } from '@/components/screens/Stock';

export const metadata: Metadata = { title: 'Stock' };

export default function StockPage() {
  return <Stock />;
}
