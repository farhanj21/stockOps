import { SHOW_COST } from './config';
import { num, round, today } from './format';
import { useStore } from './store';
import { batchMetrics, type ProductionTotals } from './production';
import type { Model } from './mrp';
import type { Batch, PurchaseOrder } from './types';

/**
 * Excel exports. Every sheet is a plain list of rows (one object per row, keys are the column
 * headers) so it opens cleanly in Excel / Google Sheets and numbers stay numbers.
 */

type Row = Record<string, string | number>;
export interface ExportSheet {
  name: string;
  rows: Row[];
}

const loadXlsx = () => import('xlsx');

/** Build the workbook in the browser and hand it to the person as a download. */
export async function downloadWorkbook(file: string, sheets: ExportSheet[]) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  // Rs columns only go to people whose role has "See costs".
  const costs = SHOW_COST && (useStore.getState().me?.perms.costs ?? false);
  if (!costs) sheets = sheets.map((s) => ({ ...s, rows: s.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.includes('(Rs')))) }));
  for (const s of sheets) {
    // An empty sheet still gets its headers so it's clear what it would hold.
    const ws = s.rows.length ? XLSX.utils.json_to_sheet(s.rows) : XLSX.utils.aoa_to_sheet([['No rows']]);
    if (s.rows.length) ws['!cols'] = Object.keys(s.rows[0]).map((k) => ({ wch: Math.min(40, Math.max(10, k.length + 2, ...s.rows.map((r) => String(r[k] ?? '').length + 1))) }));
    // Excel sheet names: max 31 chars, no : \ / ? * [ ]
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));
  }
  XLSX.writeFile(wb, `StockOps-${file}-${today()}.xlsx`);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const kindLabel = (k: string) => (k === 'packaging' ? 'Packaging' : k === 'utility' ? 'Utility' : 'Ingredient');

// ── Stock & materials ───────────────────────────────────────────────────────

/** Current stock position per material, including what plans need and the gap to par. */
export function stockRows(m: Model, only?: (id: string) => boolean): Row[] {
  return m.ings
    .filter((i) => !only || only(i.id))
    .map((i) => {
      const total = m.total(i);
      return {
        Material: i.name,
        Type: kindLabel(i.kind),
        Unit: i.unit,
        'Pack size': num(i.pack),
        Pack: i.packName,
        'In stock (in-hand)': round(num(i.inHand)),
        'Purchase requests': round(m.requestedOf(i)),
        Pipeline: round(num(i.pipeline)),
        'Available (all)': round(total),
        'Par level': round(num(i.par)),
        'Short of par': round(m.shortOf(i)),
        Status: m.isLow(i) ? 'Below par' : 'At par',
        'Allocated to plans': round(m.allocOf(i)),
        'Free after plans': round(m.free(i)),
        'Cost per unit (Rs)': r2(num(i.cost)),
        'Stock value (Rs)': r2(num(i.inHand) * num(i.cost)),
      };
    });
}

// ── Purchase requests ───────────────────────────────────────────────────────

/** Request items don't store a price, so value is at today's material prices. */
export const poValue = (m: Model, po: PurchaseOrder) => po.lines.reduce((a, l) => a + l.qty * num(m.byId[l.ing]?.cost), 0);

/** One row per item requested, with the request's own details repeated on each row so it filters and sorts cleanly. */
export function poItemRows(m: Model, pos: PurchaseOrder[]): Row[] {
  return pos.flatMap((po) =>
    po.lines.map((l) => {
      const i = m.byId[l.ing];
      return {
        'Request no.': po.id,
        'Request status': po.status === 'Open' ? 'Open' : 'Closed',
        'Request date': po.date,
        'Requested by': po.by,
        'Closed date': po.received ?? '',
        Item: i?.name ?? 'Deleted material',
        Type: i ? kindLabel(i.kind) : '',
        'Packs requested': l.packs,
        'Pack size': i ? num(i.pack) : '',
        'Pack type': i?.packName ?? '',
        'Quantity requested': round(l.qty),
        'Quantity received': l.received ? round(l.received.qty) : '',
        'Difference (received − requested)': l.received ? round(l.received.qty - l.qty) : '',
        Unit: i?.unit ?? '',
        'Item status': l.received ? (l.received.qty < l.qty - 1e-9 ? 'Received short' : 'Received') : 'Awaiting delivery',
        'Received date': l.received?.date ?? '',
        'Received by': l.received?.by ?? '',
        'Receiving note': l.received?.note ?? '',
        'Price per unit (Rs, current)': i ? r2(num(i.cost)) : '',
        'Value (Rs, current prices)': r2(l.qty * num(i?.cost)),
      };
    }),
  );
}

export const poSheets = (m: Model, pos: PurchaseOrder[]): ExportSheet[] => [{ name: 'Purchase Requests', rows: poItemRows(m, pos) }];

// ── Production ──────────────────────────────────────────────────────────────

export function batchRows(m: Model, batches: Batch[]): Row[] {
  return batches.map((b) => {
    const x = batchMetrics(b);
    return {
      'Batch no.': b.batchNo,
      Date: b.date,
      Product: m.prodById[b.productId]?.name ?? '',
      'Planned kg': round(b.plannedKg),
      'Planned units': b.plannedUnits || '',
      'Kg made': round(b.actualKg),
      Units: b.units,
      Cases: b.cases,
      'Loose units': b.upc ? b.units - b.cases * b.upc : '',
      'Wastage units': b.plannedUnits ? x.wastageUnits : '',
      'Wastage kg': round(x.wastageKg),
      'Wastage %': r2(x.wastagePct),
      'Cost per batch (Rs)': r2(b.materialCost),
      'Wastage cost (Rs)': r2(x.wastageCost),
      'Cost per kg (Rs)': r2(x.costPerKg),
      'Logged by': b.by,
      Notes: b.notes,
    };
  });
}

/** A totals table from the reports screen (by product, or month by month). */
export function totalsRows(first: string, rows: { label: string; t: ProductionTotals }[], total?: { label: string; t: ProductionTotals }): Row[] {
  return [...rows, ...(total ? [total] : [])].map(({ label, t }) => ({
    [first]: label,
    Batches: t.batches,
    'Kg made': round(t.actualKg),
    Units: t.units,
    Cases: t.cases,
    'Wastage kg': round(t.wastageKg),
    'Wastage %': r2(t.wastagePct),
    'Material cost (Rs)': r2(t.materialCost),
    'Wastage cost (Rs)': r2(t.wastageCost),
    'Avg cost per kg (Rs)': r2(t.costPerKg),
  }));
}
