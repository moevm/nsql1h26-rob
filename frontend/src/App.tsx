import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiDelete, apiList, apiPost, getAuthToken, setAuthToken } from './apiCrud';
import { CrudModal, type EntityKey } from './crudModals';
import { bsonId, formatTableCell, localInputToIso, refId, shortHexId } from './mongoJson';

const FILTER_INP =
  'bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 w-full min-w-0';
const FILTER_LBL = 'text-[10px] text-slate-500 uppercase tracking-wide block mb-0.5';

function dateInputClass(value: string): string {
  return `${FILTER_INP} ${value.trim() ? '' : 'text-slate-500'}`;
}

const ENTITY_LABEL: Record<EntityKey, string> = {
  groups: 'Groups',
  robots: 'Robots',
  tasks: 'Tasks',
  events: 'Events',
  obstacles: 'Obstacles',
  files: 'Visual logs',
};

const GROUP_STATUS = ['active', 'inactive', 'paused', 'error'] as const;
const TASK_TYPES = ['moveToTarget', 'patrol', 'scanRadius', 'custom'] as const;
const TASK_STATUS = ['active', 'paused', 'completed', 'cancelled', 'failed'] as const;
const EVENT_TYPES = [
  'battery_low',
  'battery_critical',
  'battery_delta',
  'task_created',
  'task_start',
  'task_complete',
  'task_failed',
  'error',
  'warning',
  'info',
  'track_point',
  'status_change',
  'metric_change',
  'visual_capture',
] as const;

const COLS: Record<EntityKey, string[]> = {
  groups: ['name', 'description', 'status', 'createdAt', 'updatedAt', '_id'],
  robots: ['name', 'model', 'groupName', 'groupId', 'scanRadius', 'weight', 'comments', 'createdAt', 'updatedAt', '_id'],
  tasks: ['name', 'type', 'taskStatus', 'groupName', 'groupId', 'startTime', 'endTime', 'createdAt', 'updatedAt', '_id'],
  events: ['type', 'message', 'description', 'robotId', 'taskId', 'gridFsFileId', 'timestamp', '_id'],
  obstacles: ['name', 'active', 'minX', 'maxX', 'minY', 'maxY', 'points', 'createdAt', 'updatedAt', '_id'],
  files: ['preview', 'filename', 'length', 'uploadDate', 'metadata', '_id'],
};

function emptyFilters(): Record<EntityKey, Record<string, string>> {
  return {
    groups: {
      name: '',
      description: '',
      status: '',
      created_after: '',
      created_before: '',
      updated_after: '',
      updated_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
    robots: {
      name: '',
      model: '',
      group_name: '',
      comments: '',
      group_id: '',
      scan_radius_min: '',
      scan_radius_max: '',
      weight_min: '',
      weight_max: '',
      created_after: '',
      created_before: '',
      updated_after: '',
      updated_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
    tasks: {
      name: '',
      group_name: '',
      type: '',
      task_status: '',
      group_id: '',
      robot_id: '',
      radius_min: '',
      radius_max: '',
      image_filename: '',
      created_after: '',
      created_before: '',
      updated_after: '',
      updated_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
    events: {
      type: '',
      message: '',
      description: '',
      robot_id: '',
      task_id: '',
      grid_fs_file_id: '',
      timestamp_after: '',
      timestamp_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
    obstacles: {
      name: '',
      active: '',
      min_x_gte: '',
      max_x_lte: '',
      min_y_gte: '',
      max_y_lte: '',
      created_after: '',
      created_before: '',
      updated_after: '',
      updated_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
    files: {
      filename: '',
      upload_after: '',
      upload_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
  };
}

const REF_TAB: Partial<Record<string, EntityKey>> = {
  groupId: 'groups',
  robotId: 'robots',
  taskId: 'tasks',
  gridFsFileId: 'files',
};

function RefLinkCell({
  columnKey,
  value,
  goToRef,
}: {
  columnKey: string;
  value: unknown;
  goToRef: (target: EntityKey, docId: string) => void;
}) {
  const target = REF_TAB[columnKey];
  const id = refId(value);
  if (!target || !id) {
    return <span className="text-slate-300">{formatTableCell(value, columnKey)}</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] text-slate-400" title={id}>
        {shortHexId(id)}
      </span>
      <button type="button" className="text-left text-[#7ab8ff] hover:underline text-[11px]" onClick={() => goToRef(target, id)}>
        Open {ENTITY_LABEL[target]}
      </button>
    </div>
  );
}

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) {
    return undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function isObjectIdHex(s: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(s.trim());
}

function isImageFilename(name: unknown): boolean {
  const s = String(name ?? '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(s);
}

function boundsFromPoints(pts: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

export default function App() {
  type TabKey = EntityKey | 'map';
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [tab, setTab] = useState<TabKey>('groups');
  const [filters, setFilters] = useState(emptyFilters);
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { entity: EntityKey; doc: Record<string, unknown> }>(null);
  const [groupPick, setGroupPick] = useState<{ id: string; name: string }[]>([]);
  const [robotPick, setRobotPick] = useState<{ id: string; name: string }[]>([]);
  const [mapRobots, setMapRobots] = useState<Record<string, unknown>[]>([]);
  const [mapObstacles, setMapObstacles] = useState<Record<string, unknown>[]>([]);
  const [mapSearch, setMapSearch] = useState('');
  const [mapSelectedRobotId, setMapSelectedRobotId] = useState<string | null>(null);
  const [mapSelectedGroupId, setMapSelectedGroupId] = useState<string | null>(null);
  const [mapSelectedObstacleId, setMapSelectedObstacleId] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [mapDragging, setMapDragging] = useState(false);
  const [mapDragStart, setMapDragStart] = useState({ x: 0, y: 0 });
  const mapGridRef = useRef<HTMLDivElement | null>(null);

  type TaskType = (typeof TASK_TYPES)[number];
  const [mapCreateOpen, setMapCreateOpen] = useState(false);
  const [mapTool, setMapTool] = useState<
    | null
    | { kind: 'obstacle' }
    | {
        kind: 'task';
        taskType: TaskType;
        plannedRoute: boolean;
        step: 'main' | 'planned';
        radius: number;
      }
  >(null);
  const [mapDraftPts, setMapDraftPts] = useState<{ x: number; y: number }[]>([]);
  const [mapPlannedPts, setMapPlannedPts] = useState<{ x: number; y: number }[]>([]);

  const [modal, setModal] = useState<
    | null
    | {
        mode: 'create' | 'edit';
        entity: EntityKey;
        doc?: Record<string, unknown>;
      }
  >(null);

  const doLogin = useCallback(async () => {
    setLoginErr(null);
    setLoginBusy(true);
    try {
      const res = await apiPost('/api/auth/login', { username: loginUser.trim(), password: loginPass });
      const t = typeof res.access_token === 'string' ? res.access_token : '';
      if (!t) {
        throw new Error('No access_token returned');
      }
      setAuthToken(t);
      setToken(t);
      setVersion((v) => v + 1);
    } catch (e) {
      setAuthToken(null);
      setToken(null);
      setLoginErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginBusy(false);
    }
  }, [loginUser, loginPass]);

  const doLogout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setTab('groups');
    setVersion((v) => v + 1);
  }, []);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const coordFromOid = useCallback((oid: string): { x: number; y: number } => {
    const hex = oid.trim().toLowerCase();
    const a = parseInt(hex.slice(-4), 16);
    const b = parseInt(hex.slice(-8, -4) || '0', 16);
    const x = Number.isFinite(a) ? a % 60 : 0;
    const y = Number.isFinite(b) ? b % 40 : 0;
    return { x, y };
  }, []);

  const MAP_COLS = 60;
  const MAP_ROWS = 40;
  const MAP_CELL = 20;
  const MAP_W = MAP_COLS * MAP_CELL;
  const MAP_H = MAP_ROWS * MAP_CELL;

  const pageSize = useMemo(() => {
    if (tab === 'map') {
      return 10;
    }
    const raw = filters[tab].limit;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return 10;
    }
    return Math.min(Math.max(Math.floor(n), 1), 100);
  }, [filters, tab]);

  const pageIndex = useMemo(() => {
    if (tab === 'map') {
      return 0;
    }
    const raw = filters[tab].skip;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return 0;
    }
    return Math.floor(n / pageSize);
  }, [filters, tab, pageSize]);

  const setPageIndex = useCallback(
    (idx: number) => {
      if (tab === 'map') {
        return;
      }
      const safe = Math.max(0, Math.floor(idx));
      setFilters((prev) => ({
        ...prev,
        [tab]: { ...prev[tab], skip: String(safe * pageSize), limit: String(pageSize) },
      }));
      bump();
    },
    [tab, pageSize, bump],
  );

  const goToRef = useCallback(
    (target: EntityKey, docId: string) => {
      const id = docId.trim();
      if (!id) {
        return;
      }
      const base = emptyFilters()[target];
      setTab(target);
      setFilters((prev) => ({
        ...prev,
        [target]: { ...base, doc_id: id, skip: '0', limit: '10' },
      }));
      bump();
    },
    [bump],
  );

  const goToEventsByFile = useCallback(
    (gridFsFileId: string) => {
      const id = gridFsFileId.trim();
      if (!id) {
        return;
      }
      const base = emptyFilters().events;
      setTab('events');
      setFilters((prev) => ({
        ...prev,
        events: { ...base, grid_fs_file_id: id, skip: '0', limit: '10' },
      }));
      bump();
    },
    [bump],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [g, r] = await Promise.all([
          apiList('/api/groups', { skip: 0, limit: 500 }),
          apiList('/api/robots', { skip: 0, limit: 500 }),
        ]);
        setGroupPick(
          (g as Record<string, unknown>[]).map((x) => ({
            id: bsonId(x),
            name: String(x.name ?? ''),
          })),
        );
        setRobotPick(
          (r as Record<string, unknown>[]).map((x) => ({
            id: bsonId(x),
            name: String(x.name ?? ''),
          })),
        );
      } catch {
      }
    })();
  }, [version]);

  useEffect(() => {
    if (tab !== 'map') {
      return;
    }
    void (async () => {
      try {
        const [r, o] = await Promise.all([
          apiList('/api/robots', { skip: 0, limit: 500 }),
          apiList('/api/obstacles', { skip: 0, limit: 500, active: true }),
        ]);
        setMapRobots(Array.isArray(r) ? (r as Record<string, unknown>[]) : []);
        setMapObstacles(Array.isArray(o) ? (o as Record<string, unknown>[]) : []);
      } catch {
        setMapRobots([]);
        setMapObstacles([]);
      }
    })();
  }, [tab, version]);

  const loadRows = useCallback(async () => {
    if (tab === 'map') {
      return;
    }
    setLoading(true);
    setErr(null);
    const f = filtersRef.current[tab];
    const rawDocId = (f.doc_id ?? '').trim();
    if (rawDocId && !isObjectIdHex(rawDocId)) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      let params: Record<string, string | number | boolean | undefined> = {
        skip: Number(f.skip) || 0,
        limit: Math.min(Number(f.limit) || 10, 500),
      };
      const safeDocId = isObjectIdHex(f.doc_id || '') ? f.doc_id.trim() : '';
      if (tab === 'groups') {
        params = {
          ...params,
          name: f.name || undefined,
          description: f.description || undefined,
          status: f.status || undefined,
          created_after: localInputToIso(f.created_after),
          created_before: localInputToIso(f.created_before),
          updated_after: localInputToIso(f.updated_after),
          updated_before: localInputToIso(f.updated_before),
          docId: safeDocId || undefined,
        };
      } else if (tab === 'robots') {
        params = {
          ...params,
          name: f.name || undefined,
          model: f.model || undefined,
          groupName: f.group_name || undefined,
          comments: f.comments || undefined,
          groupId: f.group_id || undefined,
          scanRadiusMin: numOrUndef(f.scan_radius_min),
          scanRadiusMax: numOrUndef(f.scan_radius_max),
          weightMin: numOrUndef(f.weight_min),
          weightMax: numOrUndef(f.weight_max),
          created_after: localInputToIso(f.created_after),
          created_before: localInputToIso(f.created_before),
          updated_after: localInputToIso(f.updated_after),
          updated_before: localInputToIso(f.updated_before),
          docId: safeDocId || undefined,
        };
      } else if (tab === 'tasks') {
        params = {
          ...params,
          name: f.name || undefined,
          groupName: f.group_name || undefined,
          type: f.type || undefined,
          taskStatus: f.task_status || undefined,
          groupId: f.group_id || undefined,
          robotId: f.robot_id || undefined,
          radiusMin: numOrUndef(f.radius_min),
          radiusMax: numOrUndef(f.radius_max),
          imageFilename: f.image_filename || undefined,
          created_after: localInputToIso(f.created_after),
          created_before: localInputToIso(f.created_before),
          updated_after: localInputToIso(f.updated_after),
          updated_before: localInputToIso(f.updated_before),
          docId: safeDocId || undefined,
        };
      } else if (tab === 'events') {
        const safeEventDocId = isObjectIdHex(f.doc_id || '') ? f.doc_id.trim() : '';
        params = {
          ...params,
          type: f.type || undefined,
          message: f.message || undefined,
          description: f.description || undefined,
          robotId: f.robot_id || undefined,
          taskId: f.task_id || undefined,
          gridFsFileId: f.grid_fs_file_id?.trim() || undefined,
          timestampAfter: localInputToIso(f.timestamp_after),
          timestampBefore: localInputToIso(f.timestamp_before),
          docId: safeEventDocId || undefined,
        };
      } else if (tab === 'obstacles') {
        const act = f.active;
        params = {
          ...params,
          name: f.name || undefined,
          active: act === 'true' ? true : act === 'false' ? false : undefined,
          minXGte: numOrUndef(f.min_x_gte),
          maxXLte: numOrUndef(f.max_x_lte),
          minYGte: numOrUndef(f.min_y_gte),
          maxYLte: numOrUndef(f.max_y_lte),
          created_after: localInputToIso(f.created_after),
          created_before: localInputToIso(f.created_before),
          updated_after: localInputToIso(f.updated_after),
          updated_before: localInputToIso(f.updated_before),
          docId: safeDocId || undefined,
        };
      } else if (tab === 'files') {
        const safeFileDocId = isObjectIdHex(f.doc_id || '') ? f.doc_id.trim() : '';
        params = {
          ...params,
          filename: f.filename || undefined,
          upload_after: localInputToIso(f.upload_after),
          upload_before: localInputToIso(f.upload_before),
          docId: safeFileDocId || undefined,
        };
      }
      const endpoint = tab === 'files' ? '/api/gridfs/files' : `/api/${tab}`;
      const data = (await apiList(endpoint, params)) as unknown;
      setRows(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, version]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const setF = (key: string, value: string) => {
    if (tab === 'map') {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      [tab]: { ...prev[tab], [key]: value },
    }));
  };

  const clearFilters = () => {
    if (tab === 'map') {
      return;
    }
    setFilters((prev) => ({ ...prev, [tab]: emptyFilters()[tab] }));
    setErr(null);
    bump();
  };

  const onDelete = async (doc: Record<string, unknown>) => {
    // Deprecated: use modal confirm UI.
    void doc;
  };

  const filterPanel = useMemo(() => {
    if (tab === 'map') {
      return null;
    }
    const f = filters[tab];
    if (tab === 'groups') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <label>
            <span className={FILTER_LBL}>name</span>
            <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>description</span>
            <input className={FILTER_INP} value={f.description} onChange={(e) => setF('description', e.target.value)} />
          </label>
          <label>
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
          <label>
            <span className={FILTER_LBL}>doc_id</span>
            <input className={FILTER_INP} value={f.doc_id} onChange={(e) => setF('doc_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_after</span>
            <input type="datetime-local" className={dateInputClass(f.created_after)} value={f.created_after} onChange={(e) => setF('created_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_before</span>
            <input type="datetime-local" className={dateInputClass(f.created_before)} value={f.created_before} onChange={(e) => setF('created_before', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_after</span>
            <input type="datetime-local" className={dateInputClass(f.updated_after)} value={f.updated_after} onChange={(e) => setF('updated_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_before</span>
            <input type="datetime-local" className={dateInputClass(f.updated_before)} value={f.updated_before} onChange={(e) => setF('updated_before', e.target.value)} />
          </label>
        </div>
      );
    }
    if (tab === 'robots') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <label>
            <span className={FILTER_LBL}>name</span>
            <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>model</span>
            <input className={FILTER_INP} value={f.model} onChange={(e) => setF('model', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>group_name</span>
            <input className={FILTER_INP} value={f.group_name} onChange={(e) => setF('group_name', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>comments</span>
            <input className={FILTER_INP} value={f.comments} onChange={(e) => setF('comments', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>group_id</span>
            <input className={FILTER_INP} value={f.group_id} onChange={(e) => setF('group_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>scan_radius_min</span>
            <input type="number" className={FILTER_INP} value={f.scan_radius_min} onChange={(e) => setF('scan_radius_min', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>scan_radius_max</span>
            <input type="number" className={FILTER_INP} value={f.scan_radius_max} onChange={(e) => setF('scan_radius_max', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>weight_min</span>
            <input type="number" className={FILTER_INP} value={f.weight_min} onChange={(e) => setF('weight_min', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>weight_max</span>
            <input type="number" className={FILTER_INP} value={f.weight_max} onChange={(e) => setF('weight_max', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>doc_id</span>
            <input className={FILTER_INP} value={f.doc_id} onChange={(e) => setF('doc_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_after</span>
            <input type="datetime-local" className={dateInputClass(f.created_after)} value={f.created_after} onChange={(e) => setF('created_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_before</span>
            <input type="datetime-local" className={dateInputClass(f.created_before)} value={f.created_before} onChange={(e) => setF('created_before', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_after</span>
            <input type="datetime-local" className={dateInputClass(f.updated_after)} value={f.updated_after} onChange={(e) => setF('updated_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_before</span>
            <input type="datetime-local" className={dateInputClass(f.updated_before)} value={f.updated_before} onChange={(e) => setF('updated_before', e.target.value)} />
          </label>
        </div>
      );
    }
    if (tab === 'tasks') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <label>
            <span className={FILTER_LBL}>name</span>
            <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>group_name</span>
            <input className={FILTER_INP} value={f.group_name} onChange={(e) => setF('group_name', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>type</span>
            <select className={FILTER_INP} value={f.type} onChange={(e) => setF('type', e.target.value)}>
              <option value="">—</option>
              {TASK_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
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
          <label>
            <span className={FILTER_LBL}>group_id</span>
            <select className={FILTER_INP} value={f.group_id} onChange={(e) => setF('group_id', e.target.value)}>
              <option value="">—</option>
              {groupPick.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id.slice(-6)})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={FILTER_LBL}>robot_id</span>
            <select className={FILTER_INP} value={f.robot_id} onChange={(e) => setF('robot_id', e.target.value)}>
              <option value="">—</option>
              {robotPick.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id.slice(-6)})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={FILTER_LBL}>radius_min</span>
            <input type="number" className={FILTER_INP} value={f.radius_min} onChange={(e) => setF('radius_min', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>radius_max</span>
            <input type="number" className={FILTER_INP} value={f.radius_max} onChange={(e) => setF('radius_max', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>image_filename</span>
            <input className={FILTER_INP} value={f.image_filename} onChange={(e) => setF('image_filename', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>doc_id</span>
            <input className={FILTER_INP} value={f.doc_id} onChange={(e) => setF('doc_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_after</span>
            <input type="datetime-local" className={dateInputClass(f.created_after)} value={f.created_after} onChange={(e) => setF('created_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_before</span>
            <input type="datetime-local" className={dateInputClass(f.created_before)} value={f.created_before} onChange={(e) => setF('created_before', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_after</span>
            <input type="datetime-local" className={dateInputClass(f.updated_after)} value={f.updated_after} onChange={(e) => setF('updated_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_before</span>
            <input type="datetime-local" className={dateInputClass(f.updated_before)} value={f.updated_before} onChange={(e) => setF('updated_before', e.target.value)} />
          </label>
        </div>
      );
    }
    if (tab === 'events') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <label>
            <span className={FILTER_LBL}>type</span>
            <select className={FILTER_INP} value={f.type} onChange={(e) => setF('type', e.target.value)}>
              <option value="">—</option>
              {EVENT_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={FILTER_LBL}>message</span>
            <input className={FILTER_INP} value={f.message} onChange={(e) => setF('message', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>description</span>
            <input className={FILTER_INP} value={f.description} onChange={(e) => setF('description', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>robot_id</span>
            <input className={FILTER_INP} value={f.robot_id} onChange={(e) => setF('robot_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>task_id</span>
            <input className={FILTER_INP} value={f.task_id} onChange={(e) => setF('task_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>grid_fs_file_id</span>
            <input className={FILTER_INP} value={f.grid_fs_file_id} onChange={(e) => setF('grid_fs_file_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>doc_id</span>
            <input className={FILTER_INP} value={f.doc_id} onChange={(e) => setF('doc_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>timestamp_after</span>
            <input type="datetime-local" className={dateInputClass(f.timestamp_after)} value={f.timestamp_after} onChange={(e) => setF('timestamp_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>timestamp_before</span>
            <input type="datetime-local" className={dateInputClass(f.timestamp_before)} value={f.timestamp_before} onChange={(e) => setF('timestamp_before', e.target.value)} />
          </label>
        </div>
      );
    }
    if (tab === 'files') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <label>
            <span className={FILTER_LBL}>filename</span>
            <input className={FILTER_INP} value={f.filename} onChange={(e) => setF('filename', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>doc_id</span>
            <input className={FILTER_INP} value={f.doc_id} onChange={(e) => setF('doc_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>upload_after</span>
            <input type="datetime-local" className={dateInputClass(f.upload_after)} value={f.upload_after} onChange={(e) => setF('upload_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>upload_before</span>
            <input type="datetime-local" className={dateInputClass(f.upload_before)} value={f.upload_before} onChange={(e) => setF('upload_before', e.target.value)} />
          </label>
        </div>
      );
    }
    if (tab === 'obstacles') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <label>
            <span className={FILTER_LBL}>name</span>
            <input className={FILTER_INP} value={f.name} onChange={(e) => setF('name', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>active</span>
            <select className={FILTER_INP} value={f.active} onChange={(e) => setF('active', e.target.value)}>
              <option value="">—</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            <span className={FILTER_LBL}>min_x_gte</span>
            <input type="number" className={FILTER_INP} value={f.min_x_gte} onChange={(e) => setF('min_x_gte', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>max_x_lte</span>
            <input type="number" className={FILTER_INP} value={f.max_x_lte} onChange={(e) => setF('max_x_lte', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>min_y_gte</span>
            <input type="number" className={FILTER_INP} value={f.min_y_gte} onChange={(e) => setF('min_y_gte', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>max_y_lte</span>
            <input type="number" className={FILTER_INP} value={f.max_y_lte} onChange={(e) => setF('max_y_lte', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>doc_id</span>
            <input className={FILTER_INP} value={f.doc_id} onChange={(e) => setF('doc_id', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_after</span>
            <input type="datetime-local" className={dateInputClass(f.created_after)} value={f.created_after} onChange={(e) => setF('created_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_before</span>
            <input type="datetime-local" className={dateInputClass(f.created_before)} value={f.created_before} onChange={(e) => setF('created_before', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_after</span>
            <input type="datetime-local" className={dateInputClass(f.updated_after)} value={f.updated_after} onChange={(e) => setF('updated_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>updated_before</span>
            <input type="datetime-local" className={dateInputClass(f.updated_before)} value={f.updated_before} onChange={(e) => setF('updated_before', e.target.value)} />
          </label>
        </div>
      );
    }
    return null;
  }, [tab, filters]);

  const mapView = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    const filtered = mapRobots.filter((r) => {
      if (!q) return true;
      const name = String(r.name ?? '').toLowerCase();
      const model = String(r.model ?? '').toLowerCase();
      const groupName = String(r.groupName ?? '').toLowerCase();
      const id = bsonId(r).toLowerCase();
      return name.includes(q) || model.includes(q) || groupName.includes(q) || id.includes(q);
    });
    const selected = mapSelectedRobotId ? filtered.find((r) => bsonId(r) === mapSelectedRobotId) : null;
    return { filtered, selected };
  }, [mapRobots, mapSearch, mapSelectedRobotId]);

  const mapGroups = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();
    for (const r of mapRobots) {
      const gid = refId((r as Record<string, unknown>).groupId).trim();
      const gname = String((r as Record<string, unknown>).groupName ?? '').trim();
      if (!gid) continue;
      const cur = byId.get(gid);
      if (cur) {
        cur.count += 1;
        if (!cur.name && gname) cur.name = gname;
      } else {
        byId.set(gid, { id: gid, name: gname, count: 1 });
      }
    }
    return Array.from(byId.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [mapRobots]);

  const addPointFromMouse = useCallback(
    (clientX: number, clientY: number) => {
      const el = mapGridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xPx = (clientX - rect.left) / mapZoom;
      const yPx = (clientY - rect.top) / mapZoom;
      const gx = Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xPx / MAP_CELL)));
      const gy = Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(yPx / MAP_CELL)));
      setMapDraftPts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.x === gx && last.y === gy) return prev;
        return [...prev, { x: gx, y: gy }];
      });
    },
    [MAP_CELL, MAP_COLS, MAP_ROWS, mapZoom],
  );

  const addTaskPointFromMouse = useCallback(
    (clientX: number, clientY: number) => {
      const el = mapGridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xPx = (clientX - rect.left) / mapZoom;
      const yPx = (clientY - rect.top) / mapZoom;
      const gx = Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xPx / MAP_CELL)));
      const gy = Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(yPx / MAP_CELL)));
      setMapTool((cur) => {
        if (!cur || cur.kind !== 'task') return cur;
        const pt = { x: gx, y: gy };
        if (cur.step === 'planned') {
          setMapPlannedPts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.x === pt.x && last.y === pt.y) return prev;
            return [...prev, pt];
          });
          return cur;
        }
        if (cur.taskType === 'moveToTarget' || cur.taskType === 'scanRadius') {
          setMapDraftPts([pt]);
        } else if (cur.taskType === 'patrol') {
          setMapDraftPts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.x === pt.x && last.y === pt.y) return prev;
            return [...prev, pt];
          });
        } else {
          // custom: no mandatory points, but allow user to click anyway (as a no-op)
        }
        return cur;
      });
    },
    [MAP_CELL, MAP_COLS, MAP_ROWS, mapZoom],
  );

  const openObstacleFromDraft = useCallback(() => {
    if (mapDraftPts.length < 3) {
      return;
    }
    const pairs: [number, number][] = mapDraftPts.map((p) => [p.x, p.y]);
    const first = pairs[0];
    const last = pairs[pairs.length - 1];
    const closed = last[0] === first[0] && last[1] === first[1] ? pairs : [...pairs, first];
    const b = boundsFromPoints(closed);
    setModal({
      mode: 'create',
      entity: 'obstacles',
      doc: {
        name: null,
        points: closed,
        minX: b.minX,
        maxX: b.maxX,
        minY: b.minY,
        maxY: b.maxY,
        active: true,
      },
    });
    setMapTool(null);
    setMapDraftPts([]);
    setMapPlannedPts([]);
  }, [mapDraftPts]);

  const openTaskFromDraft = useCallback(() => {
    const tool = mapTool;
    if (!tool || tool.kind !== 'task') {
      return;
    }
    const t = tool.taskType;
    const main = mapDraftPts;
    const planned = mapPlannedPts;
    const asPairs = (pts: { x: number; y: number }[]): [number, number][] => pts.map((p) => [p.x, p.y]);

    const taskDetails: Record<string, unknown> = {};
    if (t === 'moveToTarget') {
      if (main.length !== 1) return;
      taskDetails.targetPosition = { x: main[0].x, y: main[0].y };
    } else if (t === 'scanRadius') {
      if (main.length !== 1) return;
      taskDetails.center = { x: main[0].x, y: main[0].y };
      taskDetails.radius = Math.max(1, Math.floor(tool.radius));
    } else if (t === 'patrol') {
      if (main.length < 2) return;
      taskDetails.route = main.map((p) => ({ x: p.x, y: p.y }));
      // until is filled in the modal (required by backend)
    } else if (t === 'custom') {
      taskDetails.parameters = '';
    }

    const plannedPts =
      tool.plannedRoute && planned.length >= 2 ? planned : tool.plannedRoute && t === 'patrol' && main.length >= 2 ? main : [];

    setModal({
      mode: 'create',
      entity: 'tasks',
      doc: {
        name: null,
        groupId: mapSelectedGroupId || null,
        type: t,
        taskStatus: 'active',
        taskDetails,
        plannedRoute: tool.plannedRoute ? { points: asPairs(plannedPts) } : null,
      },
    });
    setMapTool(null);
    setMapDraftPts([]);
    setMapPlannedPts([]);
  }, [mapTool, mapDraftPts, mapPlannedPts, mapSelectedGroupId]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-sm bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div>
            <div className="text-base font-semibold text-slate-100">Sign in</div>
          </div>
          {loginErr && <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{loginErr}</div>}
          <label className="block">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide block mb-0.5">username</span>
            <input
              className="bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide block mb-0.5">password</span>
            <input
              type="password"
              className="bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doLogin();
              }}
            />
          </label>
          <button
            type="button"
            className="w-full text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-50"
            disabled={loginBusy}
            onClick={() => void doLogin()}
          >
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 custom-scrollbar">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <nav className="flex flex-wrap gap-2 items-center">
          {(Object.keys(ENTITY_LABEL) as EntityKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tab === k ? 'bg-[#137fec]/20 border-[#137fec]/50 text-[#7ab8ff]' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              {ENTITY_LABEL[k]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTab('map')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tab === 'map' ? 'bg-[#137fec]/20 border-[#137fec]/50 text-[#7ab8ff]' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            Map
          </button>
          <div className="flex-1" />
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-600"
            onClick={doLogout}
          >
            Log out
          </button>
        </nav>

        {tab === 'map' ? (
          <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex h-[78vh] min-h-[640px]">
              <aside className="w-80 border-r border-slate-800 bg-[#101922] p-4 space-y-3 overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-slate-200">Map</h2>
                </div>
                <input
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
                  value={mapSearch}
                  onChange={(e) => setMapSearch(e.target.value)}
                  placeholder="Search name/model/group/id…"
                />
                <div className="text-[11px] text-slate-500">
                  Showing <span className="text-slate-200">{mapView.filtered.length}</span>
                </div>
                <div className="space-y-2">
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <button
                      type="button"
                      aria-expanded={mapCreateOpen}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        mapCreateOpen
                          ? 'bg-[#137fec]/10 border-[#137fec]/35 text-slate-100'
                          : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700 hover:bg-slate-900/70'
                      }`}
                      onClick={() => setMapCreateOpen((v) => !v)}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">Create on map</span>
                        <span className="text-[11px] text-slate-500">click to {mapCreateOpen ? 'collapse' : 'expand'}</span>
                      </span>
                      <span className={`text-slate-300 transition-transform ${mapCreateOpen ? 'rotate-180' : 'rotate-0'}`} aria-hidden="true">
                        ▾
                      </span>
                    </button>

                    {mapCreateOpen && (
                      <div className="grid grid-cols-1 gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className={`text-xs px-3 py-2 rounded border ${
                              mapTool?.kind === 'task' ? 'bg-[#137fec]/10 border-[#137fec]/40 text-slate-100' : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700'
                            }`}
                            onClick={() => {
                              setMapTool({ kind: 'task', taskType: 'moveToTarget', plannedRoute: false, step: 'main', radius: 8 });
                              setMapDraftPts([]);
                              setMapPlannedPts([]);
                            }}
                          >
                            Task
                          </button>
                          <button
                            type="button"
                            className={`text-xs px-3 py-2 rounded border ${
                              mapTool?.kind === 'obstacle' ? 'bg-[#137fec]/10 border-[#137fec]/40 text-slate-100' : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700'
                            }`}
                            onClick={() => {
                              setMapTool({ kind: 'obstacle' });
                              setMapDraftPts([]);
                              setMapPlannedPts([]);
                            }}
                          >
                            Obstacle
                          </button>
                        </div>

                        {mapTool?.kind === 'task' && (
                          <div className="grid grid-cols-1 gap-2">
                            <label>
                              <span className={FILTER_LBL}>type</span>
                              <select
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
                                value={mapTool.taskType}
                                onChange={(e) => {
                                  const next = e.target.value as TaskType;
                                  setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, taskType: next, step: 'main' } : cur));
                                  setMapDraftPts([]);
                                  setMapPlannedPts([]);
                                }}
                              >
                                {TASK_TYPES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="flex items-center gap-2 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                checked={mapTool.plannedRoute}
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, plannedRoute: next, step: 'main' } : cur));
                                  if (!next) setMapPlannedPts([]);
                                }}
                              />
                              Add planned route
                            </label>

                            {mapTool.taskType === 'scanRadius' && (
                              <label>
                                <span className={FILTER_LBL}>radius</span>
                                <input
                                  type="range"
                                  min={1}
                                  max={50}
                                  value={mapTool.radius}
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, radius: Number.isFinite(n) ? n : cur.radius } : cur));
                                  }}
                                  className="w-full"
                                />
                                <div className="text-[11px] text-slate-500">r = {Math.floor(mapTool.radius)}</div>
                              </label>
                            )}

                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="flex-1 text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-900"
                                onClick={() => {
                                  if (mapTool.step === 'planned') setMapPlannedPts([]);
                                  else setMapDraftPts([]);
                                }}
                              >
                                Clear
                              </button>
                              {mapTool.plannedRoute && (
                                <button
                                  type="button"
                                  className="flex-1 text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-900"
                                  onClick={() => setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, step: cur.step === 'main' ? 'planned' : 'main' } : cur))}
                                >
                                  {mapTool.step === 'main' ? 'Planned…' : 'Main…'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="flex-1 text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-50"
                                disabled={
                                  mapTool.taskType === 'moveToTarget'
                                    ? mapDraftPts.length !== 1
                                    : mapTool.taskType === 'scanRadius'
                                      ? mapDraftPts.length !== 1
                                      : mapTool.taskType === 'patrol'
                                        ? mapDraftPts.length < 2
                                        : false
                                }
                                onClick={() => {
                                  openTaskFromDraft();
                                }}
                              >
                                Open form
                              </button>
                            </div>

                            <div className="text-[11px] text-slate-500">
                              {mapTool.step === 'planned'
                                ? `Planned route points: ${mapPlannedPts.length} (need 2+)`
                                : mapTool.taskType === 'patrol'
                                  ? `Route points: ${mapDraftPts.length} (need 2+)`
                                  : mapTool.taskType === 'custom'
                                    ? `Optional point clicks`
                                    : `Point: ${mapDraftPts.length} (need 1)`}
                            </div>
                          </div>
                        )}

                        {mapTool?.kind === 'obstacle' && (
                          <div className="grid grid-cols-1 gap-2">
                            <div className="text-xs text-slate-300">Click vertices on the map.</div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="flex-1 text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-900"
                                onClick={() => setMapDraftPts([])}
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                className="flex-1 text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-50"
                                disabled={mapDraftPts.length < 3}
                                onClick={() => {
                                  openObstacleFromDraft();
                                }}
                              >
                                Open form
                              </button>
                            </div>
                            <div className="text-[11px] text-slate-500">{`Obstacle draft points: ${mapDraftPts.length} (need 3+)`}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide">Groups</div>
                      {mapSelectedGroupId && (
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
                          onClick={() => setMapSelectedGroupId(null)}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {mapGroups.length ? (
                        mapGroups.map((g) => {
                          const active = g.id === mapSelectedGroupId;
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                setMapSelectedGroupId((prev) => (prev === g.id ? null : g.id));
                                setMapSelectedRobotId(null);
                                setMapSelectedObstacleId(null);
                              }}
                              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                                active ? 'bg-[#137fec]/10 border-[#137fec]/40' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="text-xs text-slate-200 font-medium">{g.name || '—'}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {shortHexId(g.id)} · {g.count} robot(s)
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="text-[11px] text-slate-600">—</div>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Robots</div>
                    <div className="space-y-2">
                      {mapView.filtered.map((r) => {
                        const id = bsonId(r);
                        const active = id && id === mapSelectedRobotId;
                        const inGroup = mapSelectedGroupId ? refId((r as Record<string, unknown>).groupId) === mapSelectedGroupId : false;
                        return (
                          <button
                            key={id || JSON.stringify(r)}
                            type="button"
                            onClick={() => {
                              setMapSelectedRobotId(id || null);
                              setMapSelectedObstacleId(null);
                            }}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                              active
                                ? 'bg-[#137fec]/10 border-[#137fec]/40'
                                : inGroup
                                  ? 'bg-[#137fec]/5 border-[#137fec]/25'
                                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="text-xs text-slate-200 font-medium">{String(r.name ?? '—')}</div>
                            <div className="text-[10px] text-slate-500">{String(r.groupName ?? '—')} · {shortHexId(id || '')}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </aside>

              <div
                className={`flex-1 bg-slate-950 relative overflow-hidden ${mapDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={(e) => {
                  if (mapTool) {
                    const el = e.target as Element | null;
                    if (el && el.closest('[data-map-interactive="true"]')) {
                      return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    if (mapTool.kind === 'task') {
                      addTaskPointFromMouse(e.clientX, e.clientY);
                    } else {
                      addPointFromMouse(e.clientX, e.clientY);
                    }
                    return;
                  }
                  setMapDragging(true);
                  setMapDragStart({ x: e.clientX - mapOffset.x * mapZoom, y: e.clientY - mapOffset.y * mapZoom });
                }}
                onMouseMove={(e) => {
                  if (!mapDragging) return;
                  setMapOffset({ x: (e.clientX - mapDragStart.x) / mapZoom, y: (e.clientY - mapDragStart.y) / mapZoom });
                }}
                onMouseUp={() => setMapDragging(false)}
                onMouseLeave={() => setMapDragging(false)}
                onWheel={(e) => {
                  e.preventDefault();
                  const dir = e.deltaY > 0 ? -1 : 1;
                  const next = Math.min(3, Math.max(0.5, mapZoom + dir * 0.1));
                  setMapZoom(next);
                }}
              >
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <button
                    type="button"
                    className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => setMapZoom((z) => Math.min(3, z + 0.2))}
                  >
                    Zoom +
                  </button>
                  <button
                    type="button"
                    className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => setMapZoom((z) => Math.max(0.5, z - 0.2))}
                  >
                    Zoom -
                  </button>
                  <button
                    type="button"
                    className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => {
                      setMapZoom(1);
                      setMapOffset({ x: 0, y: 0 });
                    }}
                  >
                    Reset ({Math.round(mapZoom * 100)}%)
                  </button>
                  {mapSelectedRobotId && (
                    <button
                      type="button"
                      className="bg-[#137fec] px-3 py-1.5 rounded-lg border border-[#137fec]/50 text-xs text-white font-medium hover:bg-[#137fec]/80"
                      onClick={() => {
                        const selected = mapView.selected;
                        const id = mapSelectedRobotId;
                        const c = selected ? (selected as Record<string, unknown>).coordinates : null;
                        const xy =
                          c && typeof c === 'object' && c !== null && 'x' in c && 'y' in c
                            ? { x: Number((c as { x: unknown }).x), y: Number((c as { y: unknown }).y) }
                            : coordFromOid(id);
                        const x = Number.isFinite(xy.x) ? Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xy.x))) : 0;
                        const y = Number.isFinite(xy.y) ? Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(xy.y))) : 0;
                        setMapOffset({
                          x: Math.floor((MAP_W / 2 - (x * MAP_CELL + MAP_CELL / 2)) / mapZoom),
                          y: Math.floor((MAP_H / 2 - (y * MAP_CELL + MAP_CELL / 2)) / mapZoom),
                        });
                      }}
                    >
                      Center
                    </button>
                  )}
                </div>

                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `scale(${mapZoom}) translate(${mapOffset.x}px, ${mapOffset.y}px)`,
                    transformOrigin: '0 0',
                    transition: mapDragging ? 'none' : 'transform 120ms ease-out',
                  }}
                >
                  <div ref={mapGridRef} className="relative" style={{ width: `${MAP_W}px`, height: `${MAP_H}px` }}>
                    <div
                      className="absolute inset-0 grid pointer-events-none"
                      style={{
                        gridTemplateColumns: `repeat(${MAP_COLS}, ${MAP_CELL}px)`,
                        gridTemplateRows: `repeat(${MAP_ROWS}, ${MAP_CELL}px)`,
                      }}
                    >
                      {Array.from({ length: MAP_COLS * MAP_ROWS }).map((_, i) => (
                        <div key={i} className="border border-slate-800/40" />
                      ))}
                    </div>

                    <svg className="absolute inset-0" width={MAP_W} height={MAP_H}>
                      {mapObstacles
                        .filter((o) => Boolean((o as Record<string, unknown>).active))
                        .map((o, idx) => {
                          const raw = (o as Record<string, unknown>).points;
                          if (!Array.isArray(raw)) return null;
                          const pts: { x: number; y: number }[] = [];
                          for (const item of raw) {
                            if (!Array.isArray(item) || item.length !== 2) return null;
                            const [x, y] = item as [unknown, unknown];
                            const nx = Number(x);
                            const ny = Number(y);
                            if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
                            pts.push({ x: nx, y: ny });
                          }
                          if (pts.length < 3) return null;
                          const d = pts
                            .map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`)
                            .join(' ');
                          const oid = bsonId(o);
                          const key = oid || `ob_${idx}`;
                          const selected = oid && oid === mapSelectedObstacleId;
                          const name = String((o as Record<string, unknown>).name ?? 'Obstacle');
                          return (
                            <polygon
                              key={key}
                              data-map-interactive="true"
                              points={d}
                              fill="rgba(249, 115, 22, 0.18)"
                              stroke={selected ? 'rgba(19, 127, 236, 0.95)' : 'rgba(249, 115, 22, 0.85)'}
                              strokeWidth={selected ? 3 : 2}
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!oid) return;
                                setMapSelectedObstacleId(oid);
                                setMapSelectedRobotId(null);
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as SVGPolygonElement).style.fill = 'rgba(249, 115, 22, 0.26)';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as SVGPolygonElement).style.fill = 'rgba(249, 115, 22, 0.18)';
                              }}
                              aria-label={name}
                            />
                          );
                        })}
                    </svg>

                    {mapTool?.kind === 'obstacle' && mapDraftPts.length >= 1 && (
                      <svg className="absolute inset-0 pointer-events-none" width={MAP_W} height={MAP_H}>
                        <polyline
                          points={mapDraftPts.map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                          fill="none"
                          stroke="rgba(19,127,236,0.95)"
                          strokeWidth={2}
                        />
                        {mapDraftPts.map((p, i) => (
                          <circle key={i} cx={p.x * MAP_CELL + MAP_CELL / 2} cy={p.y * MAP_CELL + MAP_CELL / 2} r={5} fill="rgba(19,127,236,0.95)" />
                        ))}
                      </svg>
                    )}

                    {mapTool?.kind === 'task' && (mapDraftPts.length >= 1 || mapPlannedPts.length >= 1) && (
                      <svg className="absolute inset-0 pointer-events-none" width={MAP_W} height={MAP_H}>
                        {mapDraftPts.length >= 1 && (
                          <>
                            <polyline
                              points={mapDraftPts.map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                              fill="none"
                              stroke="rgba(34,197,94,0.95)"
                              strokeWidth={2}
                            />
                            {mapDraftPts.map((p, i) => (
                              <circle key={`main_${i}`} cx={p.x * MAP_CELL + MAP_CELL / 2} cy={p.y * MAP_CELL + MAP_CELL / 2} r={5} fill="rgba(34,197,94,0.95)" />
                            ))}
                          </>
                        )}
                        {mapPlannedPts.length >= 1 && (
                          <>
                            <polyline
                              points={mapPlannedPts.map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                              fill="none"
                              stroke="rgba(168,85,247,0.95)"
                              strokeWidth={2}
                            />
                            {mapPlannedPts.map((p, i) => (
                              <circle key={`pl_${i}`} cx={p.x * MAP_CELL + MAP_CELL / 2} cy={p.y * MAP_CELL + MAP_CELL / 2} r={4} fill="rgba(168,85,247,0.95)" />
                            ))}
                          </>
                        )}
                      </svg>
                    )}

                    {mapView.filtered.map((r) => {
                      const id = bsonId(r);
                      if (!id) return null;
                      const c = r.coordinates;
                      const xy =
                        c && typeof c === 'object' && c !== null && 'x' in c && 'y' in c
                          ? { x: Number((c as { x: unknown }).x), y: Number((c as { y: unknown }).y) }
                          : coordFromOid(id);
                      const x = Number.isFinite(xy.x) ? Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xy.x))) : 0;
                      const y = Number.isFinite(xy.y) ? Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(xy.y))) : 0;
                      const top = y * MAP_CELL + MAP_CELL / 2;
                      const left = x * MAP_CELL + MAP_CELL / 2;
                      const active = id === mapSelectedRobotId;
                      const inGroup = mapSelectedGroupId
                        ? refId((r as Record<string, unknown>).groupId) === mapSelectedGroupId
                        : false;
                      return (
                        <button
                          key={id}
                          type="button"
                          data-map-interactive="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMapSelectedRobotId(id);
                            setMapSelectedObstacleId(null);
                            // keep selected group as-is
                          }}
                          className={`absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-offset-4 ring-offset-slate-950 transition-colors ${
                            active
                              ? 'bg-[#137fec]/20 ring-[#137fec]'
                              : inGroup
                                ? 'bg-[#137fec]/10 ring-[#137fec]/70 hover:ring-[#137fec]'
                                : 'bg-slate-700/20 ring-slate-700 hover:ring-slate-500'
                          }`}
                          style={{ top, left }}
                          title={`${String(r.name ?? '')} (${id})`}
                        />
                      );
                    })}
                  </div>
                </div>

                {(mapView.selected || mapSelectedObstacleId) && (
                  <div className="absolute right-4 top-4 w-80 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      {mapView.selected ? (
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{String(mapView.selected.name ?? '—')}</div>
                          <div className="text-xs text-slate-500">{String(mapView.selected.model ?? '—')}</div>
                          <div className="text-xs text-slate-500">Group: {String(mapView.selected.groupName ?? '—')}</div>
                        </div>
                      ) : (
                        <div>
                          {(() => {
                            const ob = mapSelectedObstacleId ? mapObstacles.find((x) => bsonId(x) === mapSelectedObstacleId) : null;
                            return (
                              <>
                                <div className="text-sm font-semibold text-slate-100">{String((ob as any)?.name ?? 'Obstacle')}</div>
                                <div className="text-xs text-slate-500">Obstacle</div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
                        onClick={() => {
                          setMapSelectedRobotId(null);
                          setMapSelectedObstacleId(null);
                        }}
                      >
                        Close
                      </button>
                    </div>
                    {mapView.selected ? (
                      <div className="pt-3 mt-3 border-t border-slate-700 text-xs text-slate-400 space-y-1">
                        <div>
                          <span className="text-slate-500">_id:</span> <span className="font-mono text-slate-200">{bsonId(mapView.selected)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">coords:</span>{' '}
                          <span className="font-mono text-slate-200">
                            {(() => {
                              const id = bsonId(mapView.selected);
                              const c = (mapView.selected as Record<string, unknown>).coordinates;
                              const xy =
                                c && typeof c === 'object' && c !== null && 'x' in c && 'y' in c
                                  ? { x: Number((c as { x: unknown }).x), y: Number((c as { y: unknown }).y) }
                                  : coordFromOid(id);
                              const x = Number.isFinite(xy.x) ? Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xy.x))) : 0;
                              const y = Number.isFinite(xy.y) ? Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(xy.y))) : 0;
                              return `x=${x}, y=${y}`;
                            })()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-3 mt-3 border-t border-slate-700 text-xs text-slate-400 space-y-1">
                        {(() => {
                          const ob = mapSelectedObstacleId ? mapObstacles.find((x) => bsonId(x) === mapSelectedObstacleId) : null;
                          const oid = ob ? bsonId(ob) : '';
                          const pts = Array.isArray((ob as any)?.points) ? ((ob as any).points as unknown[]) : [];
                          return (
                            <>
                              <div>
                                <span className="text-slate-500">_id:</span> <span className="font-mono text-slate-200">{oid || '—'}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">points:</span> <span className="text-slate-200">{pts.length || 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">bounds:</span>{' '}
                                <span className="font-mono text-slate-200">
                                  {`x=${String((ob as any)?.minX ?? '—')}..${String((ob as any)?.maxX ?? '—')}, y=${String((ob as any)?.minY ?? '—')}..${String((ob as any)?.maxY ?? '—')}`}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Filters</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-800" onClick={clearFilters}>
                Clear
              </button>
              <button type="button" className="text-xs px-2 py-1 rounded bg-[#137fec] text-white font-medium" onClick={() => bump()}>
                Search
              </button>
              {tab !== 'files' && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    if (tab === 'tasks') {
                      setTab('map');
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
          {filterPanel}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                disabled={pageIndex <= 0 || loading}
                onClick={() => setPageIndex(pageIndex - 1)}
              >
                Prev
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                disabled={loading || rows.length < pageSize}
                onClick={() => setPageIndex(pageIndex + 1)}
              >
                Next
              </button>
              <span className="text-xs text-slate-500">
                Page <span className="text-slate-300">{pageIndex + 1}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                page
                <input
                  inputMode="numeric"
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200"
                  value={String(pageIndex + 1)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 1) {
                      setPageIndex(n - 1);
                    }
                  }}
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                per_page
                <select
                  className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200"
                  value={String(pageSize)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const safe = Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), 100) : 10;
                    setFilters((prev) => ({
                      ...prev,
                      [tab]: { ...prev[tab], limit: String(safe), skip: '0' },
                    }));
                    bump();
                  }}
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>
        )}

        {tab !== 'map' && (
          <>
            {err && <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{err}</div>}

            <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-500">{loading ? 'Loading…' : `${rows.length} row(s)`}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800/50 text-slate-400">
                      {COLS[tab].map((c) => (
                        <th key={c} className="p-2 font-medium border-b border-slate-800 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                      <th className="p-2 font-medium border-b border-slate-800 w-28">actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const fid = bsonId(row);
                      return (
                        <tr key={fid || i} className="hover:bg-slate-800/30 border-b border-slate-800/60">
                          {COLS[tab].map((c) => {
                            if (tab === 'files' && c === 'preview') {
                              const name = row.filename;
                              const showImg = fid && isImageFilename(name);
                              return (
                                <td key={c} className="p-2 align-top w-24">
                                  {showImg ? (
                                    <a href={`/api/gridfs/files/${fid}/download`} target="_blank" rel="noreferrer" className="block">
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
                            if (REF_TAB[c]) {
                              return (
                                <td key={c} className="p-2 align-top text-slate-300 max-w-[14rem] break-words">
                                  <RefLinkCell columnKey={c} value={row[c]} goToRef={goToRef} />
                                </td>
                              );
                            }
                            return (
                              <td key={c} className="p-2 align-top text-slate-300 max-w-[14rem] break-words">
                                {formatTableCell(row[c], c)}
                              </td>
                            );
                          })}
                          <td className="p-2 whitespace-nowrap">
                            {tab === 'files' ? (
                              <span className="space-x-2">
                                <a
                                  href={fid ? `/api/gridfs/files/${fid}/download` : '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#7ab8ff] hover:underline"
                                >
                                  Open
                                </a>
                                {fid ? (
                                  <button type="button" className="text-[#7ab8ff] hover:underline" onClick={() => goToEventsByFile(fid)}>
                                    Events
                                  </button>
                                ) : null}
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="text-[#7ab8ff] mr-2 hover:underline"
                                  onClick={() => setModal({ mode: 'edit', entity: tab, doc: row })}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-red-400 hover:underline"
                                  onClick={() => setDeleteConfirm({ entity: tab, doc: row })}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      {modal && (
        <CrudModal
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            bump();
          }}
          groupPick={groupPick}
          robotPick={robotPick}
          onOpenMapPicker={(payload) => {
            setModal(null);
            setTab('map');
            setMapTool({
              kind: 'task',
              taskType: payload.taskType,
              plannedRoute: payload.plannedRouteEnabled,
              step: 'main',
              radius: payload.radius,
            });
            setMapDraftPts(payload.mainPts);
            setMapPlannedPts(payload.plannedPts);
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-4 space-y-3 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-100">Confirm delete</h3>
            <div className="text-xs text-slate-300">
              Delete <span className="text-slate-100 font-medium">{ENTITY_LABEL[deleteConfirm.entity]}</span> document?
            </div>
            <div className="text-[11px] text-slate-500 font-mono break-all">{bsonId(deleteConfirm.doc) || '—'}</div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded bg-red-600 text-white font-medium"
                onClick={async () => {
                  const cur = deleteConfirm;
                  setDeleteConfirm(null);
                  const id = bsonId(cur.doc);
                  if (!id) return;
                  try {
                    await apiDelete(`/api/${cur.entity}/${id}`);
                    bump();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
