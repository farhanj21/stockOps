import { fmt, money, normH, num, plural, qu } from './format';
import type { Ingredient } from './types';

/** One material row read from an uploaded spreadsheet. */
export interface ImportRow {
  name: string;
  cost?: number;
  pack?: number;
  inHand?: number;
  pipeline?: number;
  par?: number;
}

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

export const NUMERIC_FIELDS: ImportField[] = ['cost', 'pack', 'inHand', 'pipeline', 'par'];

/** Admins may change everything; the warehouse only updates counts. */
export const importFields = (canSetup: boolean): ImportField[] => (canSetup ? ['cost', 'pack', 'par', 'inHand', 'pipeline'] : ['inHand', 'pipeline']);

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
      // A pack size of 0 can't be ordered against, so a blank-ish pack cell is ignored.
      const changed = fields.filter((k) => d[k] != null && !(k === 'pack' && (d[k] ?? 0) <= 0) && Math.abs(num(d[k]) - num(i[k])) > 1e-9);
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
    if (adds.some((a) => normH(a.name) === normH(d.name))) {
      count.skip++;
      return { name: d.name, detail: 'Listed twice in the sheet — first row used', status: 'Skipped' };
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
    patches,
    adds,
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
