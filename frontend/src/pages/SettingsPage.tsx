import React from 'react';
import { ENTITY_LABEL } from '../appConstants';
import { apiAppExport, apiAppImport } from '../apiCrud';
import type { EntityKey } from '../crudModals';
import { useMission } from '../mission/missionContext';

const IMPORT_COLLECTIONS: EntityKey[] = ['groups', 'robots', 'tasks', 'events', 'obstacles'];

type ImportReportRow = { label: string; count: number };

function parseImportReport(data: unknown): ImportReportRow[] | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const rec = data as Record<string, unknown>;
  const imported = rec.imported;
  if (!imported || typeof imported !== 'object') {
    return null;
  }
  const imp = imported as Record<string, unknown>;
  const rows: ImportReportRow[] = [];
  for (const key of IMPORT_COLLECTIONS) {
    const raw = imp[key];
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    rows.push({ label: ENTITY_LABEL[key], count: n });
  }
  const gfsRaw = rec.gridfs_files;
  const gfs = typeof gfsRaw === 'number' && Number.isFinite(gfsRaw) ? gfsRaw : 0;
  rows.push({ label: 'GridFS files', count: gfs });
  return rows;
}

export function SettingsPage() {
  const [importReport, setImportReport] = React.useState<ImportReportRow[] | null>(null);
  const m = useMission() as {
    userRole: string | null;
    ioBusy: boolean;
    setIoBusy: (v: boolean) => void;
    ioMsg: string | null;
    setIoMsg: (v: string | null) => void;
    bump: () => void;
  };
  const { userRole, ioBusy, setIoBusy, ioMsg, setIoMsg, bump } = m;

  return (
    <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3 max-w-xl">
      <h1 className="text-lg font-semibold text-slate-100">Import / export</h1>
      <p className="text-xs text-slate-500 leading-relaxed">
        Single JSON bundle for all collections and GridFS files. Import replaces application data (not user accounts). Export matches the same structure.
      </p>
      {userRole !== 'admin' && <p className="text-sm text-amber-400/90">Administrator role required.</p>}
      {importReport && (
        <div className="text-xs text-slate-400 space-y-0.5">
          <div className="text-slate-300">Imported:</div>
          {importReport.map((row) => (
            <div key={row.label} className="pl-0">
              {row.label}:{' '}
              <span className="font-bold text-slate-100 tabular-nums">{row.count}</span>
            </div>
          ))}
        </div>
      )}
      {ioMsg && <p className="text-xs text-slate-400">{ioMsg}</p>}
      {userRole === 'admin' && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={ioBusy}
            className="text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-50"
            onClick={() =>
              void (async () => {
                setIoMsg(null);
                setImportReport(null);
                setIoBusy(true);
                try {
                  const data = await apiAppExport();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'robot-app-export.json';
                  a.click();
                  URL.revokeObjectURL(url);
                  setIoMsg('Export downloaded.');
                } catch (e) {
                  setIoMsg(e instanceof Error ? e.message : String(e));
                } finally {
                  setIoBusy(false);
                }
              })()
            }
          >
            {ioBusy ? 'Working…' : 'Export all data'}
          </button>
          <label className="text-xs px-3 py-2 rounded border border-slate-600 text-slate-200 hover:bg-slate-800 cursor-pointer">
            Import…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={ioBusy}
              onChange={(e) =>
                void (async () => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setIoMsg(null);
                  setImportReport(null);
                  setIoBusy(true);
                  try {
                    const text = await file.text();
                    const body = JSON.parse(text) as unknown;
                    const result = await apiAppImport(body);
                    const report = parseImportReport(result);
                    setImportReport(report);
                    setIoMsg(report ? null : 'Import completed.');
                    bump();
                  } catch (err) {
                    setImportReport(null);
                    setIoMsg(err instanceof Error ? err.message : String(err));
                  } finally {
                    setIoBusy(false);
                  }
                })()
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}
