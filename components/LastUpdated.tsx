'use client';

import { Icon } from '@/components/Icon';
import { fmtDate } from '@/lib/format';
import { useModel } from '@/lib/model';

/** "9 Nov 2026, 3:42 pm" in the viewer's local time. */
function dateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()}`;
}

/**
 * When stock was last updated (counted, adjusted, imported or received) and the most recent batch
 * produced. Shown on Home, Stock and Production so everyone can see how fresh the numbers are.
 */
export function LastUpdated() {
  const m = useModel();
  const stock = m.data.lastStockUpdate;
  // Batches come newest first (by production date, then when they were logged).
  const batch = m.data.batches[0];
  return (
    <div className="last-updated" role="status">
      <span>
        <Icon name="box" size={14} />
        Stock last updated:{' '}
        <strong>{stock ? dateTime(stock.at) : 'never'}</strong>
        {stock?.by ? <span className="subtle"> by {stock.by}</span> : null}
      </span>
      <span>
        <Icon name="clipboard" size={14} />
        Last production:{' '}
        <strong>{batch ? fmtDate(batch.date) : 'none yet'}</strong>
        {batch ? (
          <span className="subtle">
            {' '}
            · {batch.batchNo} · {m.prodById[batch.productId]?.name ?? '—'}
          </span>
        ) : null}
      </span>
    </div>
  );
}
