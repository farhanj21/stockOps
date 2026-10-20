import type { Metadata } from 'next';
import { Dashboard } from '@/components/screens/Dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default function HomePage() {
  return <Dashboard />;
}
