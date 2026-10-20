'use client';

import { useCallback } from 'react';
import { useIsWide } from '@/lib/hooks';
import { useUI } from '@/lib/ui';

/**
 * Open a material or recipe sheet. On desktop the search dropdown closes behind it;
 * on mobile the inline results stay so closing the sheet returns to them.
 */
export function useOpeners() {
  const wide = useIsWide();
  const open = useCallback(
    (type: 'material' | 'product', id: string) => {
      const ui = useUI.getState();
      ui.openSheet(type, id);
      if (wide) ui.set({ query: '' });
    },
    [wide],
  );
  return {
    openMat: useCallback((id: string) => open('material', id), [open]),
    openProd: useCallback((id: string) => open('product', id), [open]),
  };
}
