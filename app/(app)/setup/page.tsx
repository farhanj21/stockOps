import type { Metadata } from 'next';
import { RequirePerm } from '@/components/screens/RequirePerm';
import { Setup } from '@/components/screens/Setup';

export const metadata: Metadata = { title: 'Setup' };

export default function SetupPage() {
  return (
    <RequirePerm perm="setup">
      <Setup />
    </RequirePerm>
  );
}
