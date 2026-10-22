import { round } from './format';
import type { Data, RecipeLine } from './types';

/** Recipe from a batch weight and % mix lines, plus fixed per-batch packaging counts. */
function pctBom(kg: number, pcts: [string, number][], packs: [string, number][] = []): RecipeLine[] {
  return [
    ...pcts.map(([ing, p]) => ({ ing, qty: round((kg * p) / 100) })),
    ...packs.map(([ing, qty]) => ({ ing, qty })),
  ];
}

/** Sample chocolate plant: materials, three products with recipes, two plans, two POs and a demo team. */
export function seed(): Data {
  return {
    ingredients: [
      { id: 'sugar', name: 'Sugar (Powdered)', unit: 'kg', kind: 'ingredient', cost: 180, pack: 25, packName: 'bag', par: 200, inHand: 2243, pipeline: 456 },
      { id: 'condensed', name: 'Condensed Milk', unit: 'kg', kind: 'ingredient', cost: 650, pack: 50, packName: 'drum', par: 300, inHand: 1450, pipeline: 950 },
      { id: 'starch', name: 'Starch UT4', unit: 'kg', kind: 'ingredient', cost: 3150, pack: 25, packName: 'bag', par: 50, inHand: 73, pipeline: 80 },
      { id: 'coconut', name: 'Coconut Oil (Un Hydro)', unit: 'kg', kind: 'ingredient', cost: 1230, pack: 200, packName: 'drum', par: 500, inHand: 1954, pipeline: 2154 },
      { id: 'pko', name: 'PKO 38 (HPKO)', unit: 'kg', kind: 'ingredient', cost: 620, pack: 200, packName: 'drum', par: 400, inHand: 820, pipeline: 0 },
      { id: 'soy', name: 'Soyabean Oil', unit: 'kg', kind: 'ingredient', cost: 560, pack: 200, packName: 'drum', par: 300, inHand: 410, pipeline: 200 },
      { id: 'cocoaN', name: 'Cocoa Powder (N)', unit: 'kg', kind: 'ingredient', cost: 6920, pack: 25, packName: 'bag', par: 150, inHand: 267, pipeline: 124 },
      { id: 'cocoaA', name: 'Cocoa Powder (A)', unit: 'kg', kind: 'ingredient', cost: 4130, pack: 25, packName: 'bag', par: 150, inHand: 595, pipeline: 374 },
      { id: 'smp', name: 'SMP (Skimmed Milk Powder)', unit: 'kg', kind: 'ingredient', cost: 1900, pack: 25, packName: 'bag', par: 100, inHand: 436, pipeline: 214 },
      { id: 'pgpr', name: 'PGPR', unit: 'kg', kind: 'ingredient', cost: 5200, pack: 5, packName: 'jug', par: 10, inHand: 8.7, pipeline: 0.5 },
      { id: 'lecithin', name: 'Soya Lecithin', unit: 'kg', kind: 'ingredient', cost: 700, pack: 200, packName: 'drum', par: 20, inHand: 14.5, pipeline: 200 },
      { id: 'citrate', name: 'Sodium Citrate', unit: 'kg', kind: 'ingredient', cost: 900, pack: 25, packName: 'bag', par: 25, inHand: 30, pipeline: 0 },
      { id: 'citric', name: 'Citric Acid', unit: 'kg', kind: 'ingredient', cost: 650, pack: 25, packName: 'bag', par: 10, inHand: 12, pipeline: 0 },
      { id: 'dsp', name: 'Di Sodium Phosphate', unit: 'kg', kind: 'ingredient', cost: 750, pack: 25, packName: 'bag', par: 15, inHand: 9, pipeline: 0 },
      { id: 'salt', name: 'Salt', unit: 'kg', kind: 'ingredient', cost: 60, pack: 25, packName: 'bag', par: 10, inHand: 18, pipeline: 0 },
      { id: 'saltvan', name: 'Salt + Vanilla Powder', unit: 'kg', kind: 'ingredient', cost: 2200, pack: 5, packName: 'pack', par: 10, inHand: 6, pipeline: 0 },
      { id: 'water', name: 'Water (process)', unit: 'kg', kind: 'utility', cost: 0, pack: 1, packName: 'kg', par: 0, inHand: 0, pipeline: 0 },
      { id: 'bags', name: 'Poly Bags', unit: 'pcs', kind: 'packaging', cost: 6, pack: 1000, packName: 'bundle', par: 3000, inHand: 5200, pipeline: 0 },
      { id: 'cartons', name: 'Cartons', unit: 'pcs', kind: 'packaging', cost: 85, pack: 50, packName: 'bundle', par: 400, inHand: 900, pipeline: 0 },
      { id: 'tape', name: 'Packing Tape', unit: 'pcs', kind: 'packaging', cost: 120, pack: 36, packName: 'box', par: 24, inHand: 40, pipeline: 0 },
    ],
    products: [
      { id: 'fudge', name: 'Chocolate Hot Fudge (McD)', batchKg: 500, upb: 500, upc: 10 },
      { id: 'coating', name: 'Chocolate Coating', batchKg: 1000, upb: 200, upc: 4 },
      { id: 'compound', name: 'Compound Chocolate', batchKg: 1000, upb: 1000, upc: 10 },
    ],
    recipes: {
      fudge: pctBom(
        500,
        [['sugar', 28], ['condensed', 29], ['starch', 1.2], ['coconut', 12], ['cocoaN', 5], ['cocoaA', 4], ['water', 19.667], ['citrate', 0.5], ['citric', 0.2], ['dsp', 0.333], ['salt', 0.1]],
        [['bags', 500], ['cartons', 50], ['tape', 1]],
      ),
      coating: pctBom(
        1000,
        [['sugar', 28.101], ['coconut', 43.605], ['cocoaA', 12.597], ['smp', 14.535], ['pgpr', 0.291], ['lecithin', 0.484], ['saltvan', 0.387]],
        [['bags', 200], ['cartons', 50], ['tape', 1]],
      ),
      compound: pctBom(
        1000,
        [['pko', 29.9], ['soy', 16.1], ['sugar', 29.45], ['smp', 15.24], ['cocoaA', 8], ['lecithin', 0.51], ['pgpr', 0.3], ['saltvan', 0.5]],
        [['bags', 1000], ['cartons', 100], ['tape', 2]],
      ),
    },
    forecasts: [
      { id: 'f1', productId: 'fudge', batches: 4, date: '2026-10-23', by: 'Priya Nair' },
      { id: 'f2', productId: 'coating', batches: 3, date: '2026-10-24', by: 'Priya Nair' },
    ],
    pos: [
      { id: 'PO-2040', date: '2026-10-17', status: 'Open', by: 'Marco Silva', lines: [{ ing: 'sugar', packs: 8, qty: 200 }, { ing: 'cocoaN', packs: 4, qty: 100 }, { ing: 'lecithin', packs: 1, qty: 200 }] },
      { id: 'PO-2039', date: '2026-10-12', status: 'Received', received: '2026-10-15', by: 'Ana Reyes', lines: [{ ing: 'coconut', packs: 5, qty: 1000 }, { ing: 'smp', packs: 8, qty: 200 }] },
    ],
    users: [
      { id: 'u1', name: 'Ana Reyes', username: 'areyes', email: 'areyes@plant1.co', role: 'Admin', isOwner: true },
      { id: 'u2', name: 'Marco Silva', username: 'msilva', email: 'msilva@plant1.co', role: 'Warehouse', isOwner: false },
      { id: 'u3', name: 'Priya Nair', username: 'pnair', email: 'pnair@plant1.co', role: 'Production', isOwner: false },
      { id: 'u4', name: 'Tom Okafor', username: 'tokafor', email: 'tokafor@plant1.co', role: 'Warehouse', isOwner: false },
    ],
  };
}
