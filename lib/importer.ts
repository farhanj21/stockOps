import { normH, num } from './format';
import { IMPORT_COLS, NUMERIC_FIELDS, type ImportRow } from './import-plan';
import type { Ingredient } from './types';

export { IMPORT_COLS, importFields, planImport, type ImportRow, type PreviewRow, type RowStatus } from './import-plan';

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
    NUMERIC_FIELDS.forEach((k) => {
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

