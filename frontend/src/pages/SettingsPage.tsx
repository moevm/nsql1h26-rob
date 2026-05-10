import React from 'react';
import { apiAppExport, apiAppImport } from '../apiCrud';
import { useMission } from '../mission/missionContext';

export function SettingsPage() {
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
                  setIoBusy(true);
                  try {
                    const text = await file.text();
                    const body = JSON.parse(text) as unknown;
                    await apiAppImport(body);
                    setIoMsg('Import completed.');
                    bump();
                  } catch (err) {
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
