import type { Metadata } from 'next';
import { CreateOrgForm } from '@/components/auth/CreateOrgForm';

export const metadata: Metadata = { title: 'Create organization' };

export default function CreateOrgPage() {
  return <CreateOrgForm />;
}
