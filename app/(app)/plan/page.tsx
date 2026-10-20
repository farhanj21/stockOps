import type { Metadata } from 'next';
import { Plan } from '@/components/screens/Plan';
import { RequirePerm } from '@/components/screens/RequirePerm';

export const metadata: Metadata = { title: 'Production plan' };

export default function PlanPage() {
  return (
    <RequirePerm perm="plan">
      <Plan />
    </RequirePerm>
  );
}
