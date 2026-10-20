'use client';

import { useMemo } from 'react';
import { buildModel, type Model } from './mrp';
import { useData } from './store';

export { buildModel, packTxt, type Capacity, type Model, type PlanLine, type Suggestion } from './mrp';

export function useModel(): Model {
  const data = useData();
  return useMemo(() => buildModel(data), [data]);
}
