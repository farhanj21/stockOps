'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { plural, today } from '@/lib/format';
import { useCurrentUser } from '@/lib/hooks';
import { downloadTemplate, IMPORT_COLS, importFields, planImport, readSpreadsheet, type RowStatus } from '@/lib/importer';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { SheetHeader } from './Sheet';

const STATUS_PILL: Record<RowStatus, string> = { Same: 'neutral', Update: 'info', Skipped: 'danger', New: 'new' };
const STATUS_OPACITY: Record<RowStatus, number> = { Same: 0.55, Update: 1, Skipped: 0.7, New: 1 };

/** Excel / CSV import: pick → read → preview every change → apply (with undo). */
export function ImportSheet() {
  const { perms } = useCurrentUser();
  const imp = useUI((s) => s.imp);
  const setUI = useUI((s) => s.set);
  const ingredients = useStore((s) => s.data.ingredients);
  const importRows = useStore((s) => s.importRows);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = () => {
    const el = fileRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUI({ imp: { stage: 'loading', file: file.name } });
    try {
      const { sheet, rows } = await readSpreadsheet(file);
      setUI({ imp: { stage: 'preview', file: file.name, sheet, rows } });
    } catch (e) {
      setUI({ imp: { stage: 'error', file: file.name, err: e instanceof Error && e.message ? e.message : "Couldn't read that file." } });
    }
  }

  const intro = perms.setup
    ? "Upload your stock sheet to update costs, pack sizes, par levels and stock in one go. You'll see every change before it's saved."
    : 'Upload a stock count sheet to update in-hand and pipeline quantities. Costs, pack sizes and par levels stay as set by your Admin.';
  const fields = importFields(perms.setup);
  const cols = IMPORT_COLS.filter((c) => c.key === 'name' || (fields as string[]).includes(c.key));
  const plan = imp.stage === 'preview' ? planImport(imp.rows, ingredients, perms.setup) : null;

  /** The server re-matches the rows against live data and applies only what this role may change. */
  async function apply() {
    if (imp.stage !== 'preview' || !plan?.changes || busy) return;
    setBusy(true);
    const res = await importRows(imp.rows, imp.file);
    setBusy(false);
    if (!res) return;
    setUI({ sheetOpen: false, imp: { stage: 'pick' } });
    toast(`Imported ${imp.file} · ${plural(res.updated, 'update')}${res.added ? `, ${res.added} new` : ''}.`, { label: 'Undo', fn: res.undo });
  }

  return (
    <>
      <SheetHeader kicker="Excel import" title={imp.stage === 'preview' ? 'Review changes' : 'Import from spreadsheet'} />
      <div className="sheet-body">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
          {intro}
        </div>

        {imp.stage === 'pick' && (
          <>
            <button type="button" className="drop-zone" onClick={pickFile}>
              <Icon name="sheet" size={26} stroke={1.8} color="var(--gold-ink)" />
              <span style={{ fontSize: 14, fontWeight: 700 }}>Choose Excel or CSV file</span>
              <span className="muted" style={{ fontSize: 12 }}>
                .xlsx · .xls · .csv
              </span>
            </button>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Columns we read
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cols.map((c) => (
                  <span key={c.key} className="col-tag">
                    {c.label}
                  </span>
                ))}
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                Headers can sit below a title row. Other columns (S.no, %, batches possible) are ignored — the app calculates those.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              style={{ alignSelf: 'flex-start', padding: '0 14px' }}
              onClick={() => downloadTemplate(ingredients, today()).catch(() => toast("Couldn't build the template."))}
            >
              <Icon name="download" size={16} />
              Download current sheet as template
            </button>
          </>
        )}

        {imp.stage === 'loading' && <div className="import-loading">Reading {imp.file}…</div>}

        {imp.stage === 'error' && (
          <>
            <div className="import-error" role="alert">
              {imp.err}
            </div>
            <button type="button" className="btn btn-outline" onClick={pickFile}>
              Choose another file
            </button>
          </>
        )}

        {imp.stage === 'preview' && plan && (
          <>
            <div className="import-file">
              <span className="row-main" style={{ gap: 1 }}>
                <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>
                  {imp.file}
                </span>
                <span className="row-sub">{plan.summary(imp.sheet)}</span>
              </span>
              <button type="button" className="btn-link" style={{ flex: 'none', height: 36, padding: '0 10px', fontSize: 12 }} onClick={pickFile}>
                Change
              </button>
            </div>
            <div className="sheet-list list" style={{ background: '#fff' }}>
              {plan.preview.map((r, ix) => (
                <div key={ix} className="import-row" style={{ opacity: STATUS_OPACITY[r.status] }}>
                  <span className="row-main">
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                    <span className="row-sub tnum" style={{ lineHeight: 1.45 }}>
                      {r.detail}
                    </span>
                  </span>
                  <span className={`pill sm ${STATUS_PILL[r.status]}`}>{r.status}</span>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-lg" style={{ fontWeight: 700 }} disabled={!plan.changes || busy} onClick={apply}>
              {plan.changes ? `Apply ${plural(plan.changes, 'change')}` : 'Nothing to update'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
