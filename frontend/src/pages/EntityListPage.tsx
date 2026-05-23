import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Database, Trash2 } from 'lucide-react';
import { PageJumpInput } from '../components/PageJumpInput';
import { PageSizeInput } from '../components/PageSizeInput';
import {
  ENTITY_LABEL,
  LIST_COLS,
  LIST_LINK_COL,
  TASK_TYPES,
  emptyFilters,
  listColumnHeader,
  listHasRefColumns,
  refDisplayLabelForColumn,
  refEntityForFieldKey,
  type RefNameLookup,
} from '../appConstants';
import { EntityTabIcon } from '../components/EntityTabIcon';
import { RefLinkCell } from '../components/RefLinkCell';
import { isImageFilename } from '../entityUtils';
import { bsonId, formatTableCell, refId } from '../mongoJson';
import { ROUTES } from '../routes/paths';
import type { EntityKey } from '../crudModals';
import { useMission } from '../mission/missionContext';

function pickToMap(items: { id: string; name: string }[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items ?? []) {
    if (item.id) map.set(item.id, item.name);
  }
  return map;
}

export function EntityListPage() {
  const { entity } = useParams();
  const tab = entity as EntityKey;
  const navigate = useNavigate();
  const m = useMission() as {
    filterPanel: React.ReactNode;
    clearFilters: () => void;
    bump: () => void;
    pageIndex: number;
    setPageIndex: (idx: number) => void;
    loading: boolean;
    rows: Record<string, unknown>[];
    pageSize: number;
    listTotal: number;
    setFilters: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyFilters>>>;
    err: string | null;
    goToRef: (target: EntityKey, docId: string) => void;
    setModal: (
      v:
        | null
        | {
            mode: 'create' | 'edit';
            entity: EntityKey;
            doc?: Record<string, unknown>;
          },
    ) => void;
    setMapTool: React.Dispatch<
      React.SetStateAction<
        | null
        | { kind: 'obstacle' }
        | {
            kind: 'task';
            taskType: (typeof TASK_TYPES)[number];
            plannedRoute: boolean;
            step: 'main' | 'planned';
            radius: number;
          }
      >
    >;
    setMapDraftPts: React.Dispatch<React.SetStateAction<{ x: number; y: number }[]>>;
    setMapPlannedPts: React.Dispatch<React.SetStateAction<{ x: number; y: number }[]>>;
    clearMapPickerResume: () => void;
    setMapCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
    robotPick?: { id: string; name: string }[];
    taskPick?: { id: string; name: string }[];
    groupPick?: { id: string; name: string }[];
    gridFsFilePick?: { id: string; name: string }[];
    refShowNames?: boolean;
    setRefShowNames?: (v: boolean) => void;
  };

  const {
    filterPanel,
    clearFilters,
    bump,
    pageIndex,
    setPageIndex,
    loading,
    rows,
    pageSize,
    listTotal,
    setFilters,
    err,
    goToRef,
    setModal,
    setMapTool,
    setMapDraftPts,
    setMapPlannedPts,
    clearMapPickerResume,
    setMapCreateOpen,
    robotPick,
    taskPick,
    groupPick,
    gridFsFilePick,
    refShowNames,
    setRefShowNames,
  } = m;

  const refLookup: RefNameLookup = useMemo(
    () => ({
      groupById: pickToMap(groupPick),
      robotById: pickToMap(robotPick),
      taskById: pickToMap(taskPick),
      fileById: pickToMap(gridFsFilePick),
    }),
    [groupPick, robotPick, taskPick, gridFsFilePick],
  );

  const showRefToggle = listHasRefColumns(tab) && setRefShowNames != null;

  const listCols = LIST_COLS[tab];
  const linkCol = LIST_LINK_COL[tab];
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const onLastPage = pageIndex >= totalPages - 1;

  function dataCellClass(col: string) {
    if (col === 'name') {
      return 'px-3 py-2.5 align-top font-bold text-slate-100 max-w-[14rem] break-words';
    }
    return 'px-3 py-2.5 align-top text-slate-300 max-w-[14rem] break-words';
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <EntityTabIcon tab={tab} size="lg" className="text-[#137fec] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">{ENTITY_LABEL[tab]}</h2>
            <p className="text-slate-500 text-xs mt-0.5">Browse and manage documents in this collection.</p>
          </div>
        </div>
      </div>

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 text-[#137fec] shrink-0" />
            <h2 className="font-bold text-sm text-slate-100 truncate">Filters</h2>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">{ENTITY_LABEL[tab]}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-800 inline-flex items-center gap-1.5"
              onClick={clearFilters}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
            <button type="submit" form="entity-list-filter-form" className="text-xs px-2 py-1 rounded bg-[#137fec] text-white font-medium">
              Search
            </button>
            {showRefToggle && (
              <button
                type="button"
                title="Reference columns: short ObjectId vs linked document name"
                className={`text-xs px-2 py-1 rounded border font-medium ${
                  refShowNames
                    ? 'border-[#137fec] bg-[#137fec]/20 text-[#9ecfff]'
                    : 'border-slate-600 text-slate-400 hover:bg-slate-800'
                }`}
                onClick={() => setRefShowNames(!refShowNames)}
              >
                {refShowNames ? 'Names' : 'IDs'}
              </button>
            )}
            {tab !== 'files' && (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
                onClick={() => {
                  if (tab === 'tasks') {
                    navigate(ROUTES.map);
                    clearMapPickerResume();
                    setMapCreateOpen(true);
                    setMapTool({ kind: 'task', taskType: 'moveToTarget', plannedRoute: false, step: 'main', radius: 8 });
                    setMapDraftPts([]);
                    setMapPlannedPts([]);
                    return;
                  }
                  setModal({ mode: 'create', entity: tab });
                }}
              >
                Add…
              </button>
            )}
          </div>
        </div>
        <div className="p-3 space-y-3 border-b border-slate-800/80">
          <form
            id="entity-list-filter-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              bump();
            }}
          >
            {filterPanel}
          </form>
        </div>
        <div className="p-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 bg-slate-900/30">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-all"
              disabled={pageIndex <= 0 || loading}
              onClick={() => setPageIndex(pageIndex - 1)}
              title="Previous page"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <span className="tabular-nums">
              Page {pageIndex + 1} / {totalPages}
            </span>
            <button
              type="button"
              className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-all"
              disabled={onLastPage || loading}
              onClick={() => setPageIndex(pageIndex + 1)}
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              go
              <PageJumpInput
                pageIndex={pageIndex}
                totalPages={totalPages}
                disabled={loading}
                onCommit={(idx) => setPageIndex(idx)}
                className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              per_page
              <PageSizeInput
                pageSize={pageSize}
                onCommit={(safe) => {
                  setFilters((prev) => ({
                    ...prev,
                    [tab]: { ...prev[tab], limit: String(safe), skip: '0' },
                  }));
                  bump();
                }}
                className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200"
              />
            </label>
          </div>
        </div>
      </section>

      <>
        {err && <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{err}</div>}

        <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-3 py-3 border-b border-slate-800 bg-slate-800/50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <EntityTabIcon tab={tab} size="sm" className="text-[#137fec] shrink-0" />
              <h3 className="font-bold text-sm text-slate-100 truncate">{ENTITY_LABEL[tab]}</h3>
            </div>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">
              {loading ? 'Loading…' : `${listTotal} total · showing ${rows.length} on this page`}
            </span>
          </div>
          <div className="flex-1 overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead className="sticky top-0 z-10 bg-slate-900 shadow-sm">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  {listCols.map((c) => (
                    <th key={c} className="px-3 py-2.5 font-bold whitespace-nowrap">
                      {listColumnHeader(tab, c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-xs text-slate-300">
                {rows.map((row, i) => {
                  const fid = bsonId(row);
                  const rowId = fid;
                  return (
                    <tr key={rowId || i} className="hover:bg-[#137fec]/5 transition-colors border-b border-slate-800/60">
                      {listCols.map((c) => {
                        if (tab === 'files' && c === 'preview') {
                          const name = row.filename;
                          const showImg = fid && isImageFilename(name);
                          return (
                            <td
                              key={c}
                              className="px-3 py-2.5 align-top w-24"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {showImg ? (
                                <a
                                  href={`/api/gridfs/files/${fid}/download`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <img
                                    src={`/api/gridfs/files/${fid}/download`}
                                    alt=""
                                    className="max-h-16 w-auto rounded border border-slate-700 object-contain bg-slate-950"
                                  />
                                </a>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          );
                        }
                        if (c === linkCol) {
                          if (rowId) {
                            return (
                              <td key={c} className="px-3 py-2.5 align-top max-w-[14rem] break-words">
                                <button
                                  type="button"
                                  className="text-left font-bold text-[#7ab8ff] hover:underline w-full min-w-0"
                                  onClick={() => {
                                    navigate(ROUTES.entityDetail(tab, rowId));
                                    bump();
                                  }}
                                >
                                  {formatTableCell(row[c], c)}
                                </button>
                              </td>
                            );
                          }
                          return (
                            <td key={c} className={dataCellClass(c)}>
                              {formatTableCell(row[c], c)}
                            </td>
                          );
                        }
                        if (refEntityForFieldKey(c)) {
                          const rid = refId(row[c]);
                          const displayLabel =
                            refShowNames && rid ? refDisplayLabelForColumn(c, rid, refLookup) : undefined;
                          return (
                            <td key={c} className={dataCellClass(c)} onClick={(e) => e.stopPropagation()}>
                              <RefLinkCell columnKey={c} value={row[c]} goToRef={goToRef} displayLabel={displayLabel} />
                            </td>
                          );
                        }
                        if (tab === 'robots' && c === 'robotStatus') {
                          const st = formatTableCell(row[c], c);
                          const off = st === 'offline';
                          return (
                            <td key={c} className={dataCellClass(c)}>
                              <span className={off ? 'text-amber-400/90 font-medium' : 'text-slate-300'}>{st}</span>
                            </td>
                          );
                        }
                        return (
                          <td key={c} className={dataCellClass(c)}>
                            {formatTableCell(row[c], c)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </>
    </>
  );
}
