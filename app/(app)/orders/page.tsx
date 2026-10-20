import type { Metadata } from 'next';
import { Orders } from '@/components/screens/Orders';

export const metadata: Metadata = { title: 'Purchase orders' };

export default function OrdersPage() {
  return <Orders />;
}
