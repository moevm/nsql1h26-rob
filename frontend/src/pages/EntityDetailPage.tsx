import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Database,
  Download,
  Home,
  Image as ImageIcon,
  Loader2,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';
import { DESCRIPTION_MAX_LEN, ENTITY_LABEL, LIST_COLS } from '../appConstants';
import { ROUTES } from '../routes/paths';
import type { EntityKey } from '../crudModals';
import { apiGetJson, apiPatch } from '../apiCrud';
import { isImageFilename } from '../entityUtils';
import { bsonId, formatDateCell, formatTableCell, refId } from '../mongoJson';
import { DetailFieldValue } from '../components/DetailFieldValue';
import { useMission } from '../mission/missionContext';

export function EntityDetailPage() {
  const { entity, id: entId } = useParams();
  const tab = entity as EntityKey;
  const navigate = useNavigate();
  const m = useMission() as {
    detailDoc: Record<string, unknown> | null;
    detailLoading: boolean;
    detailErr: string | null;
    bump: () => void;
    goToRef: (target: EntityKey, docId: string) => void;
    setModal: (v: { mode: 'create' | 'edit'; entity: EntityKey; doc?: Record<string, unknown> } | null) => void;
    setDeleteConfirm: (v: null | { entity: EntityKey; doc: Record<string, unknown> }) => void;
  };
  const { detailDoc, detailLoading, detailErr, bump, goToRef, setModal, setDeleteConfirm } = m;

  const [taskVisualLogs, setTaskVisualLogs] = useState<Record<string, unknown>[] | null>(null);
  const [taskVisualLoading, setTaskVisualLoading] = useState(false);
  const [taskVisualErr, setTaskVisualErr] = useState<string | null>(null);

  const [eventDescriptionDraft, setEventDescriptionDraft] = useState('');
  const [eventDescSaving, setEventDescSaving] = useState(false);
  const [eventDescErr, setEventDescErr] = useState<string | null>(null);
  
  useEffect(() => {
    if (tab !== 'tasks' || !entId?.trim()) {
      setTaskVisualLogs(null);
      setTaskVisualErr(null);
      setTaskVisualLoading(false);
      return;
    }
    let cancelled = false;
    setTaskVisualLogs(null);
    setTaskVisualLoading(true);
    setTaskVisualErr(null);
    void (async () => {
      try {
        const j = await apiGetJson(`/api/tasks/${encodeURIComponent(entId.trim())}/visual-logs`);
        if (cancelled) return;
        setTaskVisualLogs(Array.isArray(j) ? (j as Record<string, unknown>[]) : []);
      } catch (e) {
        if (!cancelled) {
          setTaskVisualErr(e instanceof Error ? e.message : String(e));
          setTaskVisualLogs([]);
        }
      } finally {
        if (!cancelled) setTaskVisualLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, entId]);

  useEffect(() => {
    if (tab !== 'events' || !detailDoc) return;
    setEventDescriptionDraft(String(detailDoc.description ?? ''));
    setEventDescErr(null);
  }, [tab, detailDoc]);

  const eventDescriptionDirty = useMemo(() => {
    if (tab !== 'events' || !detailDoc) return false;
    return eventDescriptionDraft !== String(detailDoc.description ?? '');
  }, [tab, detailDoc, eventDescriptionDraft]);

  const sortedKeys = useMemo(() => {
    if (!detailDoc) return [];
    const keys = Object.keys(detailDoc).sort((a, b) => {
      if (a === '_id') return -1;
      if (b === '_id') return 1;
      return a.localeCompare(b);
    });
    if (tab === 'robots') {
      return keys.filter((k) => k !== 'comments');
    }
    return keys;
  }, [detailDoc, tab]);

  const summaryKeys = LIST_COLS[tab];

  const titleKey = tab === 'files' ? 'filename' : summaryKeys[0] ?? '_id';
  const subtitleKey = tab === 'files' ? 'length' : summaryKeys.length > 1 ? summaryKeys[1] : '';

  const cardTitle = useMemo(() => {
    if (!detailDoc || !(titleKey in detailDoc)) return entId ?? '—';
    return formatTableCell(detailDoc[titleKey], titleKey);
  }, [detailDoc, titleKey, entId]);

  const cardSubtitle = useMemo(() => {
    if (!detailDoc) return ENTITY_LABEL[tab];
    if (subtitleKey && subtitleKey in detailDoc) {
      return formatTableCell(detailDoc[subtitleKey], subtitleKey);
    }
    return ENTITY_LABEL[tab];
  }, [detailDoc, subtitleKey, tab]);

  const fileDownloadId = tab === 'files' && detailDoc ? bsonId(detailDoc) : null;

  useEffect(() => {
    if (detailLoading) {
      document.title = "Loading... | Robot Mission Control";
    } else if (detailDoc) {
      document.title = `${cardTitle} (${ENTITY_LABEL[tab]}) | Robot Mission Control`;
    } else {
      document.title = "Detail | Robot Mission Control";
    }
  }, [cardTitle, tab, detailLoading, detailDoc]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <button
          type="button"
          onClick={() => {
            navigate(ROUTES.entityList(tab));
            bump();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm font-bold text-slate-200 hover:border-[#137fec]/50 hover:text-[#137fec] transition-all shadow-sm w-fit group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to list</span>
        </button>
        <div className="hidden sm:block h-6 w-px bg-slate-800 shrink-0" />
        <nav className="flex items-center gap-2 text-sm text-slate-400 flex-wrap">
          <Home className="w-4 h-4 shrink-0" />
          <ChevronRight className="w-3 h-3 shrink-0" />
          <button type="button" onClick={() => navigate(ROUTES.dashboard)} className="hover:text-[#137fec] transition-colors">
            Dashboard
          </button>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <button type="button" onClick={() => navigate(ROUTES.entityList(tab))} className="hover:text-[#137fec] transition-colors">
            {ENTITY_LABEL[tab]}
          </button>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-[#137fec] font-bold font-mono text-xs break-all">{entId}</span>
        </nav>
      </div>

      {detailLoading && <div className="text-xs text-slate-500">Loading…</div>}
      {detailErr && <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{detailErr}</div>}

      {!detailLoading && detailDoc && (
        <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            <section className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between gap-2">
                <h3 className="font-bold flex items-center gap-2 text-sm">
                  <Database className="w-5 h-5 text-[#137fec] shrink-0" />
                  Record fields
                </h3>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest hidden sm:inline">
                  {sortedKeys.length} fields
                </span>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[320px]">
                  <tbody className="divide-y divide-slate-800 text-sm">
                    {sortedKeys.map((key) => (
                      <tr key={key}>
                        <td className="px-4 md:px-6 py-3 bg-slate-800/30 text-slate-400 font-medium w-[30%] md:w-[28%] align-top">
                          {key}
                        </td>
                        <td className="px-4 md:px-6 py-3 text-slate-200 text-xs break-words align-top">
                          <DetailFieldValue fieldKey={key} value={detailDoc[key]} depth={0} entityTab={tab} goToRef={goToRef} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {tab === 'tasks' && (
              <section className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between gap-2">
                  <h3 className="font-bold flex items-center gap-2 text-sm">
                    <ImageIcon className="w-5 h-5 text-[#137fec] shrink-0" />
                    {ENTITY_LABEL.files}
                  </h3>
                  {!taskVisualLoading ? (
                    <span className="text-[10px] font-mono text-slate-500">{(taskVisualLogs ?? []).length}</span>
                  ) : (
                    <span className="text-[10px] text-slate-500">…</span>
                  )}
                </div>
                {taskVisualErr ? (
                  <div className="p-4 text-xs text-red-400">{taskVisualErr}</div>
                ) : taskVisualLoading ? (
                  <div className="p-4 text-xs text-slate-500">…</div>
                ) : (taskVisualLogs ?? []).length === 0 ? (
                  <div className="p-4 text-xs text-slate-500">—</div>
                ) : (
                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[320px] text-xs">
                      <thead className="bg-slate-900/90 border-b border-slate-800">
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-2 font-bold w-20">preview</th>
                          <th className="px-3 py-2 font-bold">filename</th>
                          <th className="px-3 py-2 font-bold whitespace-nowrap">length</th>
                          <th className="px-3 py-2 font-bold whitespace-nowrap">time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {(taskVisualLogs ?? []).map((row, idx) => {
                          const fid = refId(row.gridFsFileId);
                          const name = row.filename;
                          const showImg = fid && isImageFilename(name);
                          return (
                            <tr key={fid || idx} className="hover:bg-[#137fec]/5">
                              <td className="px-3 py-2 align-top w-24">
                                {showImg ? (
                                  <a
                                    href={fid ? `/api/gridfs/files/${fid}/download` : '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <img
                                      src={fid ? `/api/gridfs/files/${fid}/download` : undefined}
                                      alt=""
                                      className="max-h-14 w-auto rounded border border-slate-700 object-contain bg-slate-950"
                                    />
                                  </a>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 align-top max-w-[14rem] break-words">
                                {fid ? (
                                  <button
                                    type="button"
                                    className="text-left font-semibold text-slate-200 hover:text-[#7ab8ff] hover:underline"
                                    onClick={() => {
                                      navigate(ROUTES.entityDetail('files', fid));
                                      bump();
                                    }}
                                  >
                                    {formatTableCell(name, 'filename')}
                                  </button>
                                ) : (
                                  formatTableCell(name, 'filename')
                                )}
                              </td>
                              <td className="px-3 py-2 align-top whitespace-nowrap">{formatTableCell(row.length, 'length')}</td>
                              <td className="px-3 py-2 align-top text-slate-400 whitespace-nowrap">
                                {formatDateCell(row.timestamp)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="w-full lg:w-[360px] shrink-0 lg:sticky lg:top-4 space-y-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-6">
                <div className="min-w-0 flex-1">
                  <h3 className="text-2xl font-bold truncate" title={cardTitle}>
                    {cardTitle}
                  </h3>
                  <p className="text-sm text-[#137fec] font-medium truncate mt-1" title={cardSubtitle}>
                    {cardSubtitle}
                  </p>
                </div>
                <div className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded uppercase tracking-wider border border-green-500/20 shrink-0">
                  {ENTITY_LABEL[tab]}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {tab === 'files' && fileDownloadId ? (
                  <a
                    href={`/api/gridfs/files/${fileDownloadId}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-[#137fec] hover:bg-[#137fec]/90 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all"
                  >
                    <Download className="w-5 h-5" />
                    <span>Open file</span>
                  </a>
                ) : null}

                {tab === 'events' && entId?.trim() && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        description <span className="text-slate-600 normal-case tracking-normal">(only field you can edit)</span>
                      </label>
                      <textarea
                        className="w-full min-h-[120px] text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#137fec]/40 resize-y"
                        value={eventDescriptionDraft}
                        onChange={(e) => {
                          setEventDescriptionDraft(e.target.value);
                          setEventDescErr(null);
                        }}
                        spellCheck={false}
                        placeholder="Event description…"
                      />
                      {eventDescErr ? <div className="text-xs text-red-400">{eventDescErr}</div> : null}
                    </div>
                    <button
                      type="button"
                      disabled={eventDescSaving || !eventDescriptionDirty || !detailDoc}
                      onClick={async () => {
                        const id = entId!.trim();
                        if (!id) return;
                        setEventDescErr(null);
                        if (eventDescriptionDraft.length > DESCRIPTION_MAX_LEN) {
                          setEventDescErr(`Description must be at most ${DESCRIPTION_MAX_LEN} characters.`);
                          return;
                        }
                        setEventDescSaving(true);
                        try {
                          await apiPatch(`/api/events/${encodeURIComponent(id)}`, {
                            description: eventDescriptionDraft.length === 0 ? null : eventDescriptionDraft,
                          });
                          bump();
                        } catch (e) {
                          setEventDescErr(e instanceof Error ? e.message : String(e));
                        } finally {
                          setEventDescSaving(false);
                        }
                      }}
                      className="w-full bg-[#137fec] hover:bg-[#137fec]/90 disabled:opacity-40 disabled:hover:bg-[#137fec] text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all"
                    >
                      {eventDescSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      <span>Save description</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm({ entity: tab, doc: detailDoc })}
                      className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all border border-red-500/20"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>Delete</span>
                    </button>
                  </>
                )}

                {tab !== 'files' && tab !== 'events' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'edit', entity: tab, doc: detailDoc })}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all border border-slate-700"
                    >
                      <Settings className="w-5 h-5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm({ entity: tab, doc: detailDoc })}
                      className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all border border-red-500/20"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
