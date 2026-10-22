import type { Metadata } from 'next';
import { RequirePerm } from '@/components/screens/RequirePerm';
import { Team } from '@/components/screens/Team';

export const metadata: Metadata = { title: 'Team' };

export default function TeamPage() {
  return (
    <RequirePerm perm="setup">
      <Team />
    </RequirePerm>
  );
}
