import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Bot,
  ClipboardList,
  Database,
  Image as ImageIcon,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { DASH_RECENT_COLS, ENTITY_LABEL, LIST_LINK_COL, listColumnHeader, refEntityForFieldKey } from '../appConstants';
import type { EntityKey } from '../crudModals';
import { RefLinkCell } from '../components/RefLinkCell';
import { ROUTES } from '../routes/paths';
import { bsonId, formatTableCell } from '../mongoJson';
import { useMission } from '../mission/missionContext';

const CARD_ICONS: Record<EntityKey, React.ReactNode> = {
  groups: <Users className="w-5 h-5 text-[#137fec]" />,
  robots: <Bot className="w-5 h-5 text-[#137fec]" />,
  tasks: <ClipboardList className="w-5 h-5 text-[#137fec]" />,
  events: <Activity className="w-5 h-5 text-[#137fec]" />,
  obstacles: <AlertTriangle className="w-5 h-5 text-[#137fec]" />,
  files: <ImageIcon className="w-5 h-5 text-[#137fec]" />,
};

const ENTITY_KEYS = ['groups', 'robots', 'tasks', 'events', 'obstacles', 'files'] as const;

function isTemporalCol(key: string): boolean {
  return key === 'timestamp' || key === 'uploadDate' || /(?:At)$/.test(key);
}

function dashColPercents(cols: readonly string[]): number[] {
  const n = cols.length;
  if (n === 0) return [];
  const last = cols[n - 1] ?? '';
  if (isTemporalCol(last) && n >= 2) {
    const tail = 30;
    const each = (100 - tail) / (n - 1);
    return cols.map((_, i) => (i === n - 1 ? tail : each));
  }
  return cols.map(() => 100 / n);
}

function dashThClass(col: string): string {
  const base = 'py-2.5 align-bottom text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800';
  const pad = 'px-3';
  if (col === 'length') return `${base} ${pad} text-right w-0`;
  if (col === 'active') return `${base} ${pad} text-center w-0`;
  if (isTemporalCol(col)) return `${base} ${pad} text-right font-mono normal-case tracking-normal text-slate-500`;
  return `${base} ${pad} text-left`;
}

function dashTdBaseClass(col: string): string {
  const pad = 'px-3 py-2.5 align-middle';
  if (col === 'length') return `${pad} text-right tabular-nums text-slate-200`;
  if (col === 'active') return `${pad} text-center tabular-nums`;
  if (isTemporalCol(col)) {
    return `${pad} text-right whitespace-nowrap font-mono tabular-nums text-[11px] text-slate-400`;
  }
  return `${pad} text-left`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { dashCounts, dashRecent, dashBoardLoaded, dashBoardErr, bump, goToRef } = useMission() as {
    dashCounts: Record<EntityKey, number> | null;
    dashRecent: Record<EntityKey, Record<string, unknown>[]> | null;
    dashBoardLoaded: boolean;
    dashBoardErr: string | null;
    bump: () => void;
    goToRef: (target: EntityKey, docId: string) => void;
  };

  useEffect(() => {
    document.title = "Dashboard | Robot Mission Control";
  }, []);
  

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Fleet Dashboard</h2>
          <p className="text-slate-500 text-xs mt-0.5 max-w-xl">
            Real-time status of ground robots and operational groups.
          </p>
        </div>
      </div>

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#137fec]" />
          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-100">Collections</h3>
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">6 entities</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ENTITY_KEYS.map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => navigate(ROUTES.entityList(k))}
                className="text-left bg-slate-900/60 border border-slate-800 rounded-xl p-4 hover:border-[#137fec]/35 hover:bg-[#137fec]/5 transition-all flex gap-3 items-start group"
              >
                <div className="mt-0.5 p-2 rounded-lg bg-[#137fec]/10 border border-[#137fec]/20 group-hover:border-[#137fec]/40 shrink-0">
                  {CARD_ICONS[k]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-slate-100 leading-tight">{ENTITY_LABEL[k]}</div>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{k}</span>
                  <div className="text-2xl font-bold text-slate-100 tabular-nums mt-2">{dashCounts ? dashCounts[k] : '—'}</div>
                  <div className="text-[10px] text-slate-600 mt-1">Open collection →</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-slate-100">Latest 5 per collection</h3>
          <span className="text-[10px] text-slate-500">Sorted by creation time</span>
        </div>
        {!dashBoardLoaded ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {dashBoardErr ? (
              <p className="text-xs text-amber-300/90 col-span-full border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2">
                Some dashboard requests failed: {dashBoardErr}. Counts and tables below may be incomplete.
              </p>
            ) : null}
            {ENTITY_KEYS.map((k) => {
              const rows = dashRecent?.[k] ?? [];
              const cols = DASH_RECENT_COLS[k];
              const linkCol = LIST_LINK_COL[k];
              return (
                <div
                  key={k}
                  className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[12rem]"
                >
                  <div className="px-3 py-2.5 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[#137fec] shrink-0">{CARD_ICONS[k]}</span>
                      <span className="font-bold text-sm text-slate-100 truncate">{ENTITY_LABEL[k]}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.entityList(k))}
                      className="text-[10px] font-semibold text-[#7ab8ff] hover:underline shrink-0"
                    >
                      View all
                    </button>
                  </div>
                  <div className="flex-1 overflow-x-auto custom-scrollbar">
                    <table className="w-full border-collapse table-fixed text-left min-w-[320px]">
                      <colgroup>
                        {dashColPercents(cols).map((p, idx) => (
                          <col key={cols[idx]} style={{ width: `${p}%` }} />
                        ))}
                      </colgroup>
                      <thead className="bg-slate-900/95">
                        <tr>
                          {cols.map((c) => (
                            <th key={c} className={`${dashThClass(c)} whitespace-nowrap`}>
                              {listColumnHeader(k, c)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-[11px] text-slate-300">
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={cols.length} className="px-3 py-4 text-center text-slate-500 italic">
                              No records
                            </td>
                          </tr>
                        ) : (
                          rows.map((row, i) => {
                            const id = bsonId(row);
                            return (
                              <tr
                                key={id || i}
                                className="hover:bg-[#137fec]/5 transition-colors border-b border-slate-800/60"
                              >
                                {cols.map((col) => {
                                  if (col === linkCol) {
                                    if (!id) {
                                      return (
                                        <td key={col} className={`${dashTdBaseClass(col)} max-w-0`}>
                                          <span className="block min-w-0 break-words line-clamp-2">
                                            {formatTableCell(row[col], col)}
                                          </span>
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={col} className={`${dashTdBaseClass(col)} max-w-0`}>
                                        <button
                                          type="button"
                                          className="block w-full min-w-0 truncate text-left font-semibold text-[#7ab8ff] hover:underline"
                                          title={String(formatTableCell(row[col], col))}
                                          onClick={() => {
                                            navigate(ROUTES.entityDetail(k, id));
                                            bump();
                                          }}
                                        >
                                          {formatTableCell(row[col], col)}
                                        </button>
                                      </td>
                                    );
                                  }
                                  if (refEntityForFieldKey(col)) {
                                    return (
                                      <td key={col} className={`${dashTdBaseClass(col)} max-w-0`}>
                                        <div className="min-w-0 break-words line-clamp-2">
                                          <RefLinkCell columnKey={col} value={row[col]} goToRef={goToRef} />
                                        </div>
                                      </td>
                                    );
                                  }
                                  if (k === 'robots' && col === 'robotStatus') {
                                    const st = formatTableCell(row[col], col);
                                    const off = st === 'offline';
                                    return (
                                      <td key={col} className={`${dashTdBaseClass(col)} max-w-0`}>
                                        <span className={off ? 'text-amber-400/90 font-medium' : 'text-slate-300'}>
                                          {st}
                                        </span>
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={col} className={`${dashTdBaseClass(col)} max-w-0`}>
                                      <span
                                        className={`block min-w-0 ${isTemporalCol(col) ? '' : 'break-words line-clamp-2'}`}
                                        title={
                                          !isTemporalCol(col) ? String(formatTableCell(row[col], col)) : undefined
                                        }
                                      >
                                        {formatTableCell(row[col], col)}
                                      </span>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
