import { fmt, money, normH, num, plural, qu } from './format';
import type { Ingredient } from './types';
import type { ImportRow } from './ui';

type ImportField = Exclude<keyof ImportRow, 'name'>;

/** Header names we recognise for each column, exact first, then by substring. */
export const IMPORT_COLS: { key: keyof ImportRow; label: string; exact: string[]; loose: string[] }[] = [
  { key: 'name', label: 'Ingredients', exact: ['ingredients', 'ingredient', 'ingredient name', 'material', 'materials', 'item', 'name'], loose: [] },
  { key: 'cost', label: 'Ingredient cost', exact: ['ingredient cost', 'cost', 'rate', 'price', 'cost per kg'], loose: ['cost', 'rate'] },
  { key: 'pack', label: 'Packing size', exact: ['packing size', 'pack size', 'individual packing size', 'packing'], loose: ['packing', 'pack size'] },
  { key: 'inHand', label: 'Inventory in hand', exact: ['inventory in hand', 'in hand', 'stock in hand', 'inhand'], loose: ['in hand', 'inhand'] },
  { key: 'pipeline', label: 'Inventory in pipeline', exact: ['inventory in pipeline', 'in pipeline', 'pipeline', 'on order'], loose: ['pipeline'] },
  { key: 'par', label: 'Set inventory par level', exact: ['set inventory par level', 'par level', 'par', 'inventory par level'], loose: ['par level', 'par'] },
];

const NUMERIC: ImportField[] = ['cost', 'pack', 'inHand', 'pipeline', 'par'];

/** Admins may change everything; the warehouse only updates counts. */
export const importFields = (canSetup: boolean): ImportField[] => (canSetup ? ['cost', 'pack', 'par', 'inHand', 'pipeline'] : ['inHand', 'pipeline']);

const loadXlsx = () => import('xlsx');

/**
 * Find the first sheet with an "Ingredients"-like header in its first 15 rows
 * (titles above the header are fine) and read one material per row below it.
 */
export async function readSpreadsheet(file: File): Promise<{ sheet: string; rows: ImportRow[] }> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  let found: { sheet: string; map: Partial<Record<keyof ImportRow, number>>; rows: unknown[][] } | null = null;

  for (const sheet of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: '' });
    for (let r = 0; r < Math.min(grid.length, 15) && !found; r++) {
      const headers = (grid[r] || []).map(normH);
      const map: Partial<Record<keyof ImportRow, number>> = {};
      const taken = (j: number) => Object.values(map).includes(j);
      IMPORT_COLS.forEach((c) => {
        let ix = headers.findIndex((h, j) => c.exact.includes(h) && !taken(j));
        if (ix < 0 && c.loose.length) ix = headers.findIndex((h, j) => c.loose.some((l) => h.includes(l)) && !taken(j));
        if (ix >= 0) map[c.key] = ix;
      });
      if (map.name != null && Object.keys(map).length >= 2) found = { sheet, map, rows: grid.slice(r + 1) };
    }
    if (found) break;
  }
  if (!found) throw new Error('No "Ingredients" column found. Check the header row matches the columns listed.');

  const { map } = found;
  const rows: ImportRow[] = [];
  found.rows.forEach((row) => {
    const name = String(row[map.name!] ?? '').trim();
    if (!name || /^total/i.test(name)) return;
    const d: ImportRow = { name };
    NUMERIC.forEach((k) => {
      const ix = map[k];
      if (ix == null) return;
      const raw = String(row[ix] ?? '').replace(/[^0-9.\-]/g, '');
      if (raw !== '' && Number.isFinite(parseFloat(raw))) d[k] = Math.max(0, parseFloat(raw));
    });
    rows.push(d);
  });
  if (!rows.length) throw new Error('The sheet has headers but no material rows.');
  return { sheet: found.sheet, rows };
}

/** Current materials as a sheet in the same column layout the importer reads. */
export async function downloadTemplate(ingredients: Ingredient[], date: string) {
  const XLSX = await loadXlsx();
  const rows = ingredients
    .filter((i) => i.kind !== 'utility')
    .map((i, ix) => ({
      'S.no': ix + 1,
      Ingredients: i.name,
      'Ingredient cost': num(i.cost),
      'Packing size': num(i.pack),
      'Inventory in hand': num(i.inHand),
      'Inventory in pipeline': num(i.pipeline),
      'Set Inventory par level': num(i.par),
    }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Stock');
  XLSX.writeFile(wb, `StockOps-materials-${date}.xlsx`);
}

export type RowStatus = 'Same' | 'Update' | 'Skipped' | 'New';

export interface PreviewRow {
  name: string;
  detail: string;
  status: RowStatus;
}

const LABEL: Record<ImportField, string> = { cost: 'Cost', pack: 'Pack', par: 'Par', inHand: 'In-hand', pipeline: 'Pipeline' };

/** Match sheet rows to materials by name and work out what applying them would change. */
export function planImport(rows: ImportRow[], ingredients: Ingredient[], canSetup: boolean) {
  const fields = importFields(canSetup);
  const byName = new Map(ingredients.map((i) => [normH(i.name), i]));
  const patches = new Map<string, Partial<Ingredient>>();
  const adds: Ingredient[] = [];
  const count = { update: 0, add: 0, skip: 0, same: 0 };
  const val = (k: ImportField, n: number) => (k === 'cost' ? money(n) : fmt(n));

  const preview: PreviewRow[] = rows.map((d) => {
    const i = byName.get(normH(d.name));
    if (i) {
      const changed = fields.filter((k) => d[k] != null && Math.abs(num(d[k]) - num(i[k])) > 1e-9);
      if (!changed.length) {
        count.same++;
        return { name: i.name, detail: 'No changes', status: 'Same' };
      }
      count.update++;
      patches.set(i.id, Object.fromEntries(changed.map((k) => [k, d[k]])));
      return {
        name: i.name,
        detail: changed.map((k) => `${LABEL[k]} ${val(k, num(i[k]))} → ${val(k, num(d[k]))}`).join(' · '),
        status: 'Update',
      };
    }
    if (!canSetup) {
      count.skip++;
      return { name: d.name, detail: 'Not in the system — ask an Admin to add it', status: 'Skipped' };
    }
    count.add++;
    const n: Ingredient = {
      id: 'm' + normH(d.name).replace(/ /g, '') + adds.length,
      name: d.name,
      unit: 'kg',
      kind: 'ingredient',
      cost: d.cost || 0,
      pack: d.pack || 25,
      packName: 'bag',
      par: d.par || 0,
      inHand: d.inHand || 0,
      pipeline: d.pipeline || 0,
    };
    adds.push(n);
    return {
      name: d.name,
      detail: `New material · ${qu(num(n.inHand) + num(n.pipeline), 'kg')} available · pack ${fmt(num(n.pack))} kg · par ${fmt(num(n.par))}`,
      status: 'New',
    };
  });

  const changes = count.update + count.add;
  return {
    preview,
    count,
    changes,
    next: [...ingredients.map((i) => (patches.has(i.id) ? { ...i, ...patches.get(i.id) } : i)), ...adds],
    summary: (sheet: string) =>
      [
        `${plural(rows.length, 'row')} on "${sheet}"`,
        count.update && `${count.update} to update`,
        count.add && `${count.add} new`,
        count.same && `${count.same} unchanged`,
        count.skip && `${count.skip} skipped`,
      ]
        .filter(Boolean)
        .join(' · '),
  };
}
