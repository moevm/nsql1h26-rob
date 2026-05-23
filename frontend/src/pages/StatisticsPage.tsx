import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { apiGetJson, buildQuery } from '../apiCrud';
import {
  ENTITY_LABEL,
  EVENT_TYPES,
  FILTER_INP,
  FILTER_LBL,
  GROUP_STATUS,
  TASK_STATUS,
  TASK_TYPES,
} from '../appConstants';
import type { EntityKey } from '../crudModals';
import { sanitizeDecimalTyping, sanitizeNonNegIntTyping, sanitizeSignedIntTyping } from '../coordinateInput';
import { dateInputClass, numOrUndef } from '../entityUtils';
import { localInputToIso } from '../mongoJson';

type StatsCollection = Exclude<EntityKey, 'files'>;

const STATS_COLLECTIONS: StatsCollection[] = ['robots', 'tasks', 'events', 'groups', 'obstacles'];

type ChartPayload = {
  collection: string;
  xField: string;
  yField: string;
  matchedTotal: number;
  xLabels: string[];
  yLabels: string[];
  cells: { x: string; y: string; count: number }[];
  labelMaxLen?: { x: number; y: number };
  axisCap?: number;
};

const LONG_TEXT_AXIS = new Set(['message', 'description', 'comments', 'name']);

const EMPTY_FILTERS: Record<StatsCollection, Record<string, string>> = {
  groups: { name: '', description: '', status: '', created_after: '', created_before: '' },
  robots: {
    name: '',
    model: '',
    group_name: '',
    comments: '',
    scan_radius_min: '',
    scan_radius_max: '',
    weight_min: '',
    weight_max: '',
    created_after: '',
    created_before: '',
  },
  tasks: {
    name: '',
    group_name: '',
    type: '',
    task_status: '',
    created_after: '',
    created_before: '',
  },
  events: {
    type: '',
    message: '',
    description: '',
    created_after: '',
    created_before: '',
    timestamp_after: '',
    timestamp_before: '',
  },
  obstacles: { name: '', active: '', min_x_gte: '', created_after: '', created_before: '' },
};

function cellCount(cells: ChartPayload['cells'], x: string, y: string): number {
  return cells.find((c) => c.x === x && c.y === y)?.count ?? 0;
}

function heatColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return 'rgb(30 41 59)';
  const t = count / max;
  const g = Math.round(41 + t * 86);
  const b = Math.round(59 + t * 177);
  return `rgb(19 ${g} ${b})`;
}

export function StatisticsPage() {
  const [collection, setCollection] = useState<StatsCollection>('robots');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [fields, setFields] = useState<string[]>([]);
  const [xField, setXField] = useState('');
  const [yField, setYField] = useState('');
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const f = filters[collection];

  const setF = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [collection]: { ...prev[collection], [key]: value },
    }));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = (await apiGetJson(`/api/stats/fields?collection=${collection}`)) as { fields?: string[] };
        const list = Array.isArray(data.fields) ? data.fields : [];
        if (cancelled) return;
        setFields(list);
        setXField((prev) => (list.includes(prev) ? prev : (list[0] ?? '')));
        setYField((prev) => {
          if (list.includes(prev) && prev !== list[0]) return prev;
          return list[1] ?? list[0] ?? '';
        });
        setChart(null);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collection]);

  const dateRangeParams = {
    created_after: localInputToIso(f.created_after),
    created_before: localInputToIso(f.created_before),
  };

  const buildParams = useCallback((): Record<string, string | number | undefined> => {
    const base = { collection, xField, yField };
    if (collection === 'groups') {
      return {
        ...base,
        name: f.name || undefined,
        description: f.description || undefined,
        status: f.status || undefined,
        ...dateRangeParams,
      };
    }
    if (collection === 'robots') {
      return {
        ...base,
        name: f.name || undefined,
        model: f.model || undefined,
        groupName: f.group_name || undefined,
        comments: f.comments || undefined,
        scanRadiusMin: numOrUndef(f.scan_radius_min),
        scanRadiusMax: numOrUndef(f.scan_radius_max),
        weightMin: numOrUndef(f.weight_min),
        weightMax: numOrUndef(f.weight_max),
        ...dateRangeParams,
      };
    }
    if (collection === 'tasks') {
      return {
        ...base,
        name: f.name || undefined,
        groupName: f.group_name || undefined,
        type: f.type || undefined,
        taskStatus: f.task_status || undefined,
        ...dateRangeParams,
      };
    }
    if (collection === 'events') {
      return {
        ...base,
        type: f.type || undefined,
        message: f.message || undefined,
        description: f.description || undefined,
        ...dateRangeParams,
        timestampAfter: localInputToIso(f.timestamp_after),
        timestampBefore: localInputToIso(f.timestamp_before),
      };
    }
    return {
      ...base,
      name: f.name || undefined,
      active: f.active === 'true' ? 'true' : f.active === 'false' ? 'false' : undefined,
      minXGte: numOrUndef(f.min_x_gte),
      ...dateRangeParams,
    };
  }, [collection, f, xField, yField]);

  const runChart = useCallback(async () => {
    if (!xField || !yField || xField === yField) {
      setErr('Choose different fields for X and Y axes.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const q = buildQuery(buildParams());
      const data = (await apiGetJson(`/api/stats/chart?${q}`)) as ChartPayload;
      setChart(data);
    } catch (e) {
      setChart(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [buildParams, xField, yField]);

  const maxCount = useMemo(() => {
    if (!chart?.cells.length) return 0;
    return Math.max(...chart.cells.map((c) => c.count));
  }, [chart]);

  const axisNote = useMemo(() => {
    if (!xField && !yField) return null;
    const parts: string[] = [];
    if (LONG_TEXT_AXIS.has(xField) || LONG_TEXT_AXIS.has(yField)) {
      parts.push('Long text labels are truncated for the heatmap');
    }
    if (collection === 'events' && (xField === 'robotId' || yField === 'robotId' || xField === 'taskId' || yField === 'taskId')) {
      parts.push('use robotName / taskName axes for readable labels; null refs appear as (empty)');
    }
    if (chart?.axisCap) {
      parts.push(`at most ${chart.axisCap} categories per axis; rest grouped as (other)`);
    }
    return parts.length ? parts.join('; ') + '.' : null;
  }, [collection, xField, yField, chart?.axisCap]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BarChart3 className="w-7 h-7 text-[#137fec] shrink-0" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Custom statistics</h2>
          <p className="text-slate-500 text-xs mt-0.5 max-w-2xl">
            Multi-criteria filter, customizable X/Y axes, and a heatmap of counts per combination (e.g. scan radius ×
            model).
          </p>
        </div>
      </div>

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3 border-b border-slate-800 bg-slate-800/50">
          <h3 className="font-bold text-sm text-slate-100">1. Data subset</h3>
        </div>
        <div className="p-3 space-y-3">
          <label className="block max-w-xs">
            <span className={FILTER_LBL}>collection</span>
            <select
              className={FILTER_INP}
              value={collection}
              onChange={(e) => setCollection(e.target.value as StatsCollection)}
            >
              {STATS_COLLECTIONS.map((c) => (
                <option key={c} value={c}>
                  {ENTITY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {collection === 'robots' && (
              <>
                <label className="block">
                  <span className={FILTER_LBL}>name (substring)</span>
                  <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} placeholder="e.g. a" />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>model</span>
                  <input className={FILTER_INP} value={f.model} onChange={(e) => setF('model', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>group_name</span>
                  <input className={FILTER_INP} value={f.group_name} onChange={(e) => setF('group_name', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>comments</span>
                  <input className={FILTER_INP} value={f.comments} onChange={(e) => setF('comments', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>scan_radius_min</span>
                  <input
                    className={FILTER_INP}
                    value={f.scan_radius_min}
                    onChange={(e) => setF('scan_radius_min', sanitizeDecimalTyping(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>scan_radius_max</span>
                  <input
                    className={FILTER_INP}
                    value={f.scan_radius_max}
                    onChange={(e) => setF('scan_radius_max', sanitizeDecimalTyping(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>weight_min</span>
                  <input
                    className={FILTER_INP}
                    value={f.weight_min}
                    onChange={(e) => setF('weight_min', sanitizeNonNegIntTyping(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>weight_max</span>
                  <input
                    className={FILTER_INP}
                    value={f.weight_max}
                    onChange={(e) => setF('weight_max', sanitizeNonNegIntTyping(e.target.value))}
                  />
                </label>
              </>
            )}
            {collection === 'groups' && (
              <>
                <label className="block">
                  <span className={FILTER_LBL}>name</span>
                  <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>description</span>
                  <input className={FILTER_INP} value={f.description} onChange={(e) => setF('description', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>status</span>
                  <select className={FILTER_INP} value={f.status} onChange={(e) => setF('status', e.target.value)}>
                    <option value="">—</option>
                    {GROUP_STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {collection === 'tasks' && (
              <>
                <label className="block">
                  <span className={FILTER_LBL}>name</span>
                  <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>type</span>
                  <select className={FILTER_INP} value={f.type} onChange={(e) => setF('type', e.target.value)}>
                    <option value="">—</option>
                    {TASK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>task_status</span>
                  <select className={FILTER_INP} value={f.task_status} onChange={(e) => setF('task_status', e.target.value)}>
                    <option value="">—</option>
                    {TASK_STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {collection === 'events' && (
              <>
                <label className="block">
                  <span className={FILTER_LBL}>type</span>
                  <select className={FILTER_INP} value={f.type} onChange={(e) => setF('type', e.target.value)}>
                    <option value="">—</option>
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>message (filter substring)</span>
                  <input className={FILTER_INP} value={f.message} onChange={(e) => setF('message', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>description (filter substring)</span>
                  <input className={FILTER_INP} value={f.description} onChange={(e) => setF('description', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>timestamp_after</span>
                  <input
                    type="datetime-local"
                    className={dateInputClass(f.timestamp_after)}
                    value={f.timestamp_after}
                    onChange={(e) => setF('timestamp_after', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>timestamp_before</span>
                  <input
                    type="datetime-local"
                    className={dateInputClass(f.timestamp_before)}
                    value={f.timestamp_before}
                    onChange={(e) => setF('timestamp_before', e.target.value)}
                  />
                </label>
              </>
            )}
            {collection === 'obstacles' && (
              <>
                <label className="block">
                  <span className={FILTER_LBL}>name</span>
                  <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} />
                </label>
                <label className="block">
                  <span className={FILTER_LBL}>active</span>
                  <select className={FILTER_INP} value={f.active} onChange={(e) => setF('active', e.target.value)}>
                    <option value="">—</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
              </>
            )}
            <label className="block">
              <span className={FILTER_LBL}>created_after</span>
              <input
                type="datetime-local"
                className={dateInputClass(f.created_after)}
                value={f.created_after}
                onChange={(e) => setF('created_after', e.target.value)}
              />
            </label>
            <label className="block">
              <span className={FILTER_LBL}>created_before</span>
              <input
                type="datetime-local"
                className={dateInputClass(f.created_before)}
                value={f.created_before}
                onChange={(e) => setF('created_before', e.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3 border-b border-slate-800 bg-slate-800/50">
          <h3 className="font-bold text-sm text-slate-100">2. Chart axes</h3>
        </div>
        <div className="p-3 flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[10rem]">
            <span className={FILTER_LBL}>X axis</span>
            <select className={FILTER_INP} value={xField} onChange={(e) => setXField(e.target.value)}>
              {fields.map((fld) => (
                <option key={fld} value={fld}>
                  {fld}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[10rem]">
            <span className={FILTER_LBL}>Y axis</span>
            <select className={FILTER_INP} value={yField} onChange={(e) => setYField(e.target.value)}>
              {fields.map((fld) => (
                <option key={fld} value={fld}>
                  {fld}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={loading || !xField || !yField || xField === yField}
            onClick={() => void runChart()}
            className="self-end text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Build chart
          </button>
        </div>
        {axisNote ? <p className="px-3 pb-3 text-[10px] text-slate-500">{axisNote}</p> : null}
      </section>

      {err && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{err}</div>
      )}

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-100">3. Distribution</h3>
          {chart && (
            <span className="text-[10px] text-slate-500">
              {chart.matchedTotal} match · X={chart.xField} · Y={chart.yField}
            </span>
          )}
        </div>
        <div className="p-4 overflow-x-auto custom-scrollbar">
          {!chart && !loading && (
            <p className="text-xs text-slate-500 italic">Configure filters and axes, then click Build chart.</p>
          )}
          {loading && <p className="text-xs text-slate-500">Computing aggregation…</p>}
          {chart && chart.xLabels.length > 0 && chart.yLabels.length > 0 && (
            <div className="min-w-[32rem]">
              <div className="flex gap-2 mb-2 pl-28 text-[10px] text-slate-500">
                {chart.xLabels.map((x) => (
                  <div key={x} className="flex-1 min-w-[3rem] text-center truncate font-medium" title={x}>
                    {x}
                  </div>
                ))}
              </div>
              {chart.yLabels.map((y) => (
                <div key={y} className="flex gap-2 mb-1 items-stretch">
                  <div className="w-24 shrink-0 text-[10px] text-slate-400 flex items-center justify-end pr-2 truncate" title={y}>
                    {y}
                  </div>
                  {chart.xLabels.map((x) => {
                    const n = cellCount(chart.cells, x, y);
                    return (
                      <div
                        key={`${x}-${y}`}
                        className="flex-1 min-w-[3rem] h-9 rounded border border-slate-800/80 flex items-center justify-center text-[11px] tabular-nums"
                        title={`${y} / ${x}: ${n}`}
                        style={{ backgroundColor: heatColor(n, maxCount) }}
                      >
                        <span className={n > 0 ? 'text-slate-100 font-semibold' : 'text-slate-600'}>{n || '·'}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
                <span>0</span>
                <div
                  className="h-2 flex-1 max-w-xs rounded"
                  style={{ background: 'linear-gradient(90deg, rgb(30 41 59), rgb(19 127 236))' }}
                />
                <span>{maxCount}</span>
              </div>
            </div>
          )}
          {chart && (chart.xLabels.length === 0 || chart.yLabels.length === 0) && (
            <p className="text-xs text-slate-500">No data points for the current filter.</p>
          )}
        </div>
      </section>
    </div>
  );
}
