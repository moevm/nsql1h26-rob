import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  apiDelete,
  apiGetOne,
  apiList,
  apiListPaged,
  getAuthRole,
  getAuthUsername,
  setAuthRole,
  setAuthToken,
  setAuthUsername,
} from './apiCrud';
import {
  ENTITY_LABEL,
  EVENT_TYPES,
  FILTER_INP,
  FILTER_LBL,
  GROUP_STATUS,
  TASK_STATUS,
  TASK_TYPES,
  emptyFilters,
  isEntityKeyTab,
  type AppTabKey,
} from './appConstants';
import {
  sanitizeBracketPointsTyping,
  sanitizeDecimalTyping,
  sanitizeNonNegIntTyping,
  sanitizeObjectIdFilterTyping,
  sanitizeRouteFilterTyping,
  sanitizeSignedIntTyping,
} from './coordinateInput';
import {
  MAP_CELL,
  MAP_COLS,
  MAP_H,
  MAP_POLL_INTERVAL_MS,
  MAP_ROWS,
  MAP_VIEW_STORAGE_KEY,
  MAP_W,
  readStoredMapView,
  type MapPickLayer,
} from './mapConstants';
import { ROUTES, parseEntityRoute, tabKeyFromPath } from './routes/paths';
import { AppShell } from './components/AppShell';
import { OidSuggestInput } from './components/OidSuggestInput';
import { PageJumpInput } from './components/PageJumpInput';
import {
  CrudModal,
  type EntityKey,
  type MapPickerObstacleResume,
  type MapPickerTaskResume,
} from './crudModals';
import {
  boundsFromPoints,
  dateInputClass,
  isObjectIdHex,
  isRouteFilterValid,
  numOrUndef,
} from './entityUtils';
import { bsonId, localInputToIso, refId, shortHexId } from './mongoJson';
import { MissionContext, type MissionApi } from './mission/missionContext';
import { DashboardPage } from './pages/DashboardPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { EntityGuard } from './pages/EntityGuard';
import { EntityListPage } from './pages/EntityListPage';
import { MapPage } from './pages/MapPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatisticsPage } from './pages/StatisticsPage';


export default function MissionApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabKeyFromPath(location.pathname);
  const pathEntityDetail = parseEntityRoute(location.pathname);
  const detailRouteId =
    pathEntityDetail.entity && pathEntityDetail.detailId && isObjectIdHex(pathEntityDetail.detailId)
      ? pathEntityDetail.detailId
      : '';

  const [userRole, setUserRole] = useState<string | null>(() => getAuthRole());
  const [username, setUsername] = useState<string | null>(() => getAuthUsername());

  const [filters, setFilters] = useState(emptyFilters);
  const [version, setVersion] = useState(0);

  const [detailDoc, setDetailDoc] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [ioBusy, setIoBusy] = useState(false);
  const [ioMsg, setIoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!pathEntityDetail.entity || !detailRouteId) {
      setDetailDoc(null);
      setDetailErr(null);
      return;
    }
    const ent = pathEntityDetail.entity;
    const id = detailRouteId;
    setDetailLoading(true);
    setDetailErr(null);
    void (async () => {
      try {
        if (ent === 'files') {
          const rows = (await apiList('/api/gridfs/files', {
            skip: 0,
            limit: 5,
            docId: id,
          })) as Record<string, unknown>[];
          setDetailDoc(rows[0] ?? null);
        } else {
          const doc = await apiGetOne(`/api/${ent}/${id}`);
          setDetailDoc(doc);
        }
      } catch (e) {
        setDetailErr(e instanceof Error ? e.message : String(e));
        setDetailDoc(null);
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [pathEntityDetail.entity, detailRouteId, version, location.pathname]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { entity: EntityKey; doc: Record<string, unknown> }>(null);
  const [groupPick, setGroupPick] = useState<{ id: string; name: string }[]>([]);
  const [robotPick, setRobotPick] = useState<{ id: string; name: string }[]>([]);
  const [refShowNames, setRefShowNames] = useState(false);
  const [taskPick, setTaskPick] = useState<{ id: string; name: string }[]>([]);
  const [gridFsFilePick, setGridFsFilePick] = useState<{ id: string; name: string }[]>([]);
  const [mapRobots, setMapRobots] = useState<Record<string, unknown>[]>([]);
  const [mapObstacles, setMapObstacles] = useState<Record<string, unknown>[]>([]);
  const [mapTasks, setMapTasks] = useState<Record<string, unknown>[]>([]);
  const [mapSearch, setMapSearch] = useState('');
  const [mapSelectedRobotId, setMapSelectedRobotId] = useState<string | null>(null);
  const [mapSelectedGroupId, setMapSelectedGroupId] = useState<string | null>(null);
  const [mapSelectedObstacleId, setMapSelectedObstacleId] = useState<string | null>(null);
  const [mapSelectedTaskId, setMapSelectedTaskId] = useState<string | null>(null);
  const initialMapView = useMemo(() => readStoredMapView(), []);
  const [mapZoom, setMapZoom] = useState(initialMapView.zoom);
  const [mapOffset, setMapOffset] = useState(initialMapView.offset);
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

  const [mapPickerResume, setMapPickerResume] = useState<MapPickerTaskResume | null>(null);
  const [mapObstaclePickerResume, setMapObstaclePickerResume] = useState<MapPickerObstacleResume | null>(null);
  const clearMapPickerResume = useCallback(() => {
    setMapPickerResume(null);
    setMapObstaclePickerResume(null);
  }, []);

  const [modal, setModal] = useState<
    | null
    | {
        mode: 'create' | 'edit';
        entity: EntityKey;
        doc?: Record<string, unknown>;
      }
  >(null);

  const doLogout = useCallback(() => {
    setAuthRole(null);
    setAuthUsername(null);
    setUserRole(null);
    setUsername(null);
    setAuthToken(null);
    setVersion((v) => v + 1);
    navigate(ROUTES.login, { replace: true });
  }, [navigate]);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const coordFromOid = useCallback((oid: string): { x: number; y: number } => {
    const hex = oid.trim().toLowerCase();
    const a = parseInt(hex.slice(-4), 16);
    const b = parseInt(hex.slice(-8, -4) || '0', 16);
    const x = Number.isFinite(a) ? a % MAP_COLS : 0;
    const y = Number.isFinite(b) ? b % MAP_ROWS : 0;
    return { x, y };
  }, [MAP_COLS, MAP_ROWS]);

  const [mapPickLayer, setMapPickLayer] = useState<MapPickLayer>('all');

  const pageSize = useMemo(() => {
    if (tab === 'map' || tab === 'home' || tab === 'settings' || tab === 'statistics') {
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
    if (tab === 'map' || tab === 'home' || tab === 'settings' || tab === 'statistics') {
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
      if (tab === 'map' || tab === 'home' || tab === 'settings' || tab === 'statistics') {
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
      if (!id || !isObjectIdHex(id)) {
        return;
      }
      navigate(ROUTES.entityDetail(target, id));
      bump();
    },
    [bump, navigate],
  );

  const goToEventsByFile = useCallback(
    (gridFsFileId: string) => {
      const id = gridFsFileId.trim();
      if (!id) {
        return;
      }
      const base = emptyFilters().events;
      navigate(ROUTES.entityList('events'));
      setFilters((prev) => ({
        ...prev,
        events: { ...base, grid_fs_file_id: id, skip: '0', limit: '10' },
      }));
      bump();
    },
    [bump, navigate],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [g, r, t, f] = await Promise.all([
          apiList('/api/groups', { skip: 0, limit: 500 }),
          apiList('/api/robots', { skip: 0, limit: 500 }),
          apiList('/api/tasks', { skip: 0, limit: 500 }),
          apiList('/api/gridfs/files', { skip: 0, limit: 500 }),
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
        setTaskPick(
          (t as Record<string, unknown>[]).map((x) => ({
            id: bsonId(x),
            name: String(x.name ?? ''),
          })),
        );
        setGridFsFilePick(
          (f as Record<string, unknown>[]).map((x) => ({
            id: bsonId(x),
            name: String(x.filename ?? ''),
          })),
        );
      } catch {
      }
    })();
  }, [version]);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify({ zoom: mapZoom, offset: mapOffset }));
    } catch {
      
    }
  }, [mapZoom, mapOffset]);

  useEffect(() => {
    if (tab !== 'map') {
      return;
    }
    let cancelled = false;
    const loadMapEntities = async () => {
      if (cancelled) return;
      try {
        const [r, o, tk] = await Promise.all([
          apiList('/api/robots', { skip: 0, limit: 500 }),
          apiList('/api/obstacles', { skip: 0, limit: 500, active: true }),
          apiList('/api/tasks', { skip: 0, limit: 500 }),
        ]);
        if (cancelled) return;
        setMapRobots(Array.isArray(r) ? (r as Record<string, unknown>[]) : []);
        setMapObstacles(Array.isArray(o) ? (o as Record<string, unknown>[]) : []);
        setMapTasks(Array.isArray(tk) ? (tk as Record<string, unknown>[]) : []);
      } catch {
        if (!cancelled) {
          setMapRobots([]);
          setMapObstacles([]);
          setMapTasks([]);
        }
      }
    };
    void loadMapEntities();
    const timer = window.setInterval(() => void loadMapEntities(), MAP_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tab, version]);

  const loadRows = useCallback(async () => {
    if (tab === 'map' || tab === 'home' || tab === 'settings' || tab === 'statistics') {
      setLoading(false);
      setErr(null);
      setListTotal(0);
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
    if (tab === 'tasks' && (f.route ?? '').trim() && !isRouteFilterValid(String(f.route ?? ''))) {
      setRows([]);
      setErr('Invalid route format. Expected: x,y;x,y; (ending with ;)');
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
          startTimeAfter: localInputToIso(f.start_after),
          startTimeBefore: localInputToIso(f.start_before),
          endTimeAfter: localInputToIso(f.end_after),
          endTimeBefore: localInputToIso(f.end_before),
          route: (f.route ?? '').trim() || undefined,
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
          created_after: localInputToIso(f.created_after),
          created_before: localInputToIso(f.created_before),
          docId: safeEventDocId || undefined,
        };
      } else if (tab === 'obstacles') {
        const act = f.active;
        params = {
          ...params,
          name: f.name || undefined,
          active: act === 'true' ? true : act === 'false' ? false : undefined,
          pointsQ: (f.points_q ?? '').trim() || undefined,
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
          metadata: f.metadata || undefined,
          lengthMin: numOrUndef(f.length_min),
          lengthMax: numOrUndef(f.length_max),
          upload_after: localInputToIso(f.upload_after),
          upload_before: localInputToIso(f.upload_before),
          docId: safeFileDocId || undefined,
        };
      }
      const endpoint = tab === 'files' ? '/api/gridfs/files' : `/api/${tab}`;
      const { items, total } = await apiListPaged(endpoint, params);
      setRows(Array.isArray(items) ? (items as Record<string, unknown>[]) : []);
      setListTotal(total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setListTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, version]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const setF = (key: string, value: string) => {
    if (!isEntityKeyTab(tab)) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      [tab]: { ...prev[tab], [key]: value },
    }));
  };

  const clearFilters = () => {
    if (!isEntityKeyTab(tab)) {
      return;
    }
    setFilters((prev) => ({ ...prev, [tab]: emptyFilters()[tab] }));
    setErr(null);
    bump();
  };

  const onDelete = async (doc: Record<string, unknown>) => {
    void doc;
  };

  const filterPanel = useMemo(() => {
    if (!isEntityKeyTab(tab)) {
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
            <span className={FILTER_LBL}>id</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.doc_id}
              onChange={(e) => setF('doc_id', sanitizeObjectIdFilterTyping(e.target.value))}
              placeholder="24 hex chars"
            />
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
            <span className={FILTER_LBL}>group_id</span>
            <OidSuggestInput
              className={FILTER_INP}
              value={f.group_id}
              onChange={(v) => setF('group_id', v)}
              placeholder="ObjectId hex or pick a hint…"
              options={groupPick}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>scan_radius_min</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.scan_radius_min}
              onChange={(e) => setF('scan_radius_min', sanitizeDecimalTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>scan_radius_max</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.scan_radius_max}
              onChange={(e) => setF('scan_radius_max', sanitizeDecimalTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>weight_min</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.weight_min}
              onChange={(e) => setF('weight_min', sanitizeNonNegIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>weight_max</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.weight_max}
              onChange={(e) => setF('weight_max', sanitizeNonNegIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>id</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.doc_id}
              onChange={(e) => setF('doc_id', sanitizeObjectIdFilterTyping(e.target.value))}
              placeholder="24 hex chars"
            />
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
            <OidSuggestInput
              className={FILTER_INP}
              value={f.group_id}
              onChange={(v) => setF('group_id', v)}
              placeholder="ObjectId hex or pick a hint…"
              options={groupPick}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>robot_id</span>
            <OidSuggestInput
              className={FILTER_INP}
              value={f.robot_id}
              onChange={(v) => setF('robot_id', v)}
              placeholder="ObjectId hex or pick a hint…"
              options={robotPick}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>radius_min</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.radius_min}
              onChange={(e) => setF('radius_min', sanitizeNonNegIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>radius_max</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.radius_max}
              onChange={(e) => setF('radius_max', sanitizeNonNegIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>image_filename</span>
            <input className={FILTER_INP} value={f.image_filename} onChange={(e) => setF('image_filename', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>start_after</span>
            <input
              type="datetime-local"
              className={dateInputClass(f.start_after)}
              value={f.start_after}
              onChange={(e) => setF('start_after', e.target.value)}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>start_before</span>
            <input
              type="datetime-local"
              className={dateInputClass(f.start_before)}
              value={f.start_before}
              onChange={(e) => setF('start_before', e.target.value)}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>end_after</span>
            <input type="datetime-local" className={dateInputClass(f.end_after)} value={f.end_after} onChange={(e) => setF('end_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>end_before</span>
            <input
              type="datetime-local"
              className={dateInputClass(f.end_before)}
              value={f.end_before}
              onChange={(e) => setF('end_before', e.target.value)}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>route (x,y; x,y; ...)</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.route}
              onChange={(e) => setF('route', sanitizeRouteFilterTyping(e.target.value))}
              placeholder="12,34;20,10;"
            />
          </label>
          <label>
            <span className={FILTER_LBL}>id</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.doc_id}
              onChange={(e) => setF('doc_id', sanitizeObjectIdFilterTyping(e.target.value))}
              placeholder="24 hex chars"
            />
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
            <OidSuggestInput
              className={FILTER_INP}
              value={f.robot_id}
              onChange={(v) => setF('robot_id', v)}
              placeholder="ObjectId hex or pick a hint…"
              options={robotPick}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>task_id</span>
            <OidSuggestInput
              className={FILTER_INP}
              value={f.task_id}
              onChange={(v) => setF('task_id', v)}
              placeholder="ObjectId hex or pick a hint…"
              options={taskPick}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>grid_fs_file_id</span>
            <OidSuggestInput
              className={FILTER_INP}
              value={f.grid_fs_file_id}
              onChange={(v) => setF('grid_fs_file_id', v)}
              placeholder="fs.files ObjectId hex or pick a hint…"
              options={gridFsFilePick}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>id</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.doc_id}
              onChange={(e) => setF('doc_id', sanitizeObjectIdFilterTyping(e.target.value))}
              placeholder="24 hex chars"
            />
          </label>
          <label>
            <span className={FILTER_LBL}>timestamp_after</span>
            <input type="datetime-local" className={dateInputClass(f.timestamp_after)} value={f.timestamp_after} onChange={(e) => setF('timestamp_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>timestamp_before</span>
            <input type="datetime-local" className={dateInputClass(f.timestamp_before)} value={f.timestamp_before} onChange={(e) => setF('timestamp_before', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_after</span>
            <input type="datetime-local" className={dateInputClass(f.created_after)} value={f.created_after} onChange={(e) => setF('created_after', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>created_before</span>
            <input type="datetime-local" className={dateInputClass(f.created_before)} value={f.created_before} onChange={(e) => setF('created_before', e.target.value)} />
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
            <span className={FILTER_LBL}>metadata</span>
            <input className={FILTER_INP} value={f.metadata} onChange={(e) => setF('metadata', e.target.value)} />
          </label>
          <label>
            <span className={FILTER_LBL}>length_min</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.length_min}
              onChange={(e) => setF('length_min', sanitizeNonNegIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>length_max</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.length_max}
              onChange={(e) => setF('length_max', sanitizeNonNegIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>id</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.doc_id}
              onChange={(e) => setF('doc_id', sanitizeObjectIdFilterTyping(e.target.value))}
              placeholder="24 hex chars"
            />
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
          <label className="sm:col-span-2">
            <span className={FILTER_LBL}>points (substring in coords)</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.points_q}
              onChange={(e) => setF('points_q', sanitizeBracketPointsTyping(e.target.value))}
              placeholder="e.g. 12.1, 1.2; 2.3, 4.12"
            />
          </label>
          <label>
            <span className={FILTER_LBL}>min_x_gte</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.min_x_gte}
              onChange={(e) => setF('min_x_gte', sanitizeSignedIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>max_x_lte</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.max_x_lte}
              onChange={(e) => setF('max_x_lte', sanitizeSignedIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>min_y_gte</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.min_y_gte}
              onChange={(e) => setF('min_y_gte', sanitizeSignedIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>max_y_lte</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.max_y_lte}
              onChange={(e) => setF('max_y_lte', sanitizeSignedIntTyping(e.target.value))}
            />
          </label>
          <label>
            <span className={FILTER_LBL}>id</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={FILTER_INP}
              value={f.doc_id}
              onChange={(e) => setF('doc_id', sanitizeObjectIdFilterTyping(e.target.value))}
              placeholder="24 hex chars"
            />
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
  }, [tab, filters, groupPick, robotPick, taskPick]);

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

  const mapObstaclesView = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    if (!q) return mapObstacles;
    return mapObstacles.filter((o) => {
      const name = String((o as Record<string, unknown>).name ?? '').toLowerCase();
      const pts = JSON.stringify((o as Record<string, unknown>).points ?? []).toLowerCase();
      const id = bsonId(o).toLowerCase();
      return name.includes(q) || pts.includes(q) || id.includes(q);
    });
  }, [mapObstacles, mapSearch]);

  const mapTasksView = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    return mapTasks.filter((t) => {
      if (!q) return true;
      const name = String(t.name ?? '').toLowerCase();
      const g = String(t.groupName ?? '').toLowerCase();
      const id = bsonId(t).toLowerCase();
      const blob = `${JSON.stringify(t.taskDetails ?? {})}${JSON.stringify(t.plannedRoute ?? {})}`.toLowerCase();
      return name.includes(q) || g.includes(q) || id.includes(q) || blob.includes(q);
    });
  }, [mapTasks, mapSearch]);

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
    if (mapObstaclePickerResume) {
      const merged: Record<string, unknown> = {
        ...mapObstaclePickerResume.seedDoc,
        points: closed,
        minX: b.minX,
        maxX: b.maxX,
        minY: b.minY,
        maxY: b.maxY,
      };
      setModal({
        mode: mapObstaclePickerResume.modalMode,
        entity: 'obstacles',
        doc: merged,
      });
    } else {
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
    }
    setMapPickerResume(null);
    setMapObstaclePickerResume(null);
    setMapTool(null);
    setMapDraftPts([]);
    setMapPlannedPts([]);
  }, [mapDraftPts, mapObstaclePickerResume]);

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
    } else if (t === 'custom') {
      const tdPrev =
        mapPickerResume && typeof mapPickerResume.seedDoc.taskDetails === 'object' && mapPickerResume.seedDoc.taskDetails !== null
          ? (mapPickerResume.seedDoc.taskDetails as Record<string, unknown>)
          : null;
      taskDetails.parameters = typeof tdPrev?.parameters === 'string' ? tdPrev.parameters : '';
    }

    const plannedPts =
      tool.plannedRoute && planned.length >= 2 ? planned : tool.plannedRoute && t === 'patrol' && main.length >= 2 ? main : [];

    const plannedRouteOut = tool.plannedRoute ? { points: asPairs(plannedPts) } : null;

    if (mapPickerResume) {
      const merged: Record<string, unknown> = {
        ...mapPickerResume.seedDoc,
        type: t,
        taskDetails,
        plannedRoute: plannedRouteOut,
      };
      setModal({
        mode: mapPickerResume.modalMode,
        entity: 'tasks',
        doc: merged,
      });
    } else {
      setModal({
        mode: 'create',
        entity: 'tasks',
        doc: {
          name: null,
          groupId: mapSelectedGroupId || null,
          type: t,
          taskStatus: 'active',
          taskDetails,
          plannedRoute: plannedRouteOut,
        },
      });
    }

    setMapPickerResume(null);
    setMapObstaclePickerResume(null);
    setMapTool(null);
    setMapDraftPts([]);
    setMapPlannedPts([]);
  }, [mapTool, mapDraftPts, mapPlannedPts, mapSelectedGroupId, mapPickerResume]);

  const [dashCounts, setDashCounts] = useState<Record<EntityKey, number> | null>(null);
  const [dashRecent, setDashRecent] = useState<Record<EntityKey, Record<string, unknown>[]> | null>(null);
  const [dashBoardLoaded, setDashBoardLoaded] = useState(false);
  const [dashBoardErr, setDashBoardErr] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'home') {
      return;
    }
    let cancelled = false;
    setDashBoardLoaded(false);
    setDashBoardErr(null);
    void (async () => {
      const recentQ = { skip: 0, limit: 5, sortDir: 'desc' };
      const settled = await Promise.allSettled([
        apiList('/api/groups', { skip: 0, limit: 500 }),
        apiList('/api/robots', { skip: 0, limit: 500 }),
        apiList('/api/tasks', { skip: 0, limit: 500 }),
        apiList('/api/events', { skip: 0, limit: 500 }),
        apiList('/api/obstacles', { skip: 0, limit: 500 }),
        apiList('/api/gridfs/files', { skip: 0, limit: 500 }),
        apiList('/api/groups', recentQ),
        apiList('/api/robots', recentQ),
        apiList('/api/tasks', recentQ),
        apiList('/api/events', recentQ),
        apiList('/api/obstacles', recentQ),
        apiList('/api/gridfs/files', { skip: 0, limit: 5, sortDir: 'desc' }),
      ]);
      if (cancelled) {
        return;
      }
      const arr = (i: number) =>
        settled[i]?.status === 'fulfilled' && Array.isArray(settled[i].value)
          ? (settled[i].value as unknown[])
          : [];
      const rej = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      setDashBoardErr(
        rej ? (rej.reason instanceof Error ? rej.reason.message : String(rej.reason)) : null,
      );
      setDashCounts({
        groups: arr(0).length,
        robots: arr(1).length,
        tasks: arr(2).length,
        events: arr(3).length,
        obstacles: arr(4).length,
        files: arr(5).length,
      });
      setDashRecent({
        groups: arr(6) as Record<string, unknown>[],
        robots: arr(7) as Record<string, unknown>[],
        tasks: arr(8) as Record<string, unknown>[],
        events: arr(9) as Record<string, unknown>[],
        obstacles: arr(10) as Record<string, unknown>[],
        files: arr(11) as Record<string, unknown>[],
      });
      setDashBoardLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, version]);


  const mission: MissionApi = {
    dashCounts,
    dashRecent,
    dashBoardLoaded,
    dashBoardErr,
    userRole,
    ioBusy,
    setIoBusy,
    ioMsg,
    setIoMsg,
    bump,
    tab,
    filterPanel,
    clearFilters,
    pageIndex,
    setPageIndex,
    loading,
    rows,
    listTotal,
    pageSize,
    setFilters,
    err,
    goToRef,
    goToEventsByFile,
    setModal,
    setDeleteConfirm,
    detailDoc,
    detailLoading,
    detailErr,
    mapSearch,
    setMapSearch,
    mapView,
    mapCreateOpen,
    setMapCreateOpen,
    mapTool,
    setMapTool,
    mapDraftPts,
    setMapDraftPts,
    mapPlannedPts,
    setMapPlannedPts,
    openTaskFromDraft,
    mapPickerResume,
    mapObstaclePickerResume,
    clearMapPickerResume,
    openObstacleFromDraft,
    mapGroups,
    mapSelectedGroupId,
    setMapSelectedGroupId,
    mapSelectedRobotId,
    setMapSelectedRobotId,
    addTaskPointFromMouse,
    addPointFromMouse,
    mapDragging,
    setMapDragging,
    mapOffset,
    setMapOffset,
    mapZoom,
    setMapZoom,
    mapDragStart,
    setMapDragStart,
    mapGridRef,
    coordFromOid,
    mapObstaclesView,
    mapTasksView,
    mapTasks,
    mapObstacles,
    mapSelectedObstacleId,
    setMapSelectedObstacleId,
    mapSelectedTaskId,
    setMapSelectedTaskId,
    mapPickLayer,
    setMapPickLayer,
    navigate,
    robotPick,
    taskPick,
    refShowNames,
    setRefShowNames,
    groupPick,
    gridFsFilePick,
  };

  return (
    <>
      <MissionContext.Provider value={mission}>
        <AppShell onLogout={doLogout} userRole={userRole} username={username}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route
              path="/:entity/:id"
              element={
                <EntityGuard>
                  <EntityDetailPage />
                </EntityGuard>
              }
            />
            <Route
              path="/:entity"
              element={
                <EntityGuard>
                  <EntityListPage />
                </EntityGuard>
              }
            />
            <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
          </Routes>
        </AppShell>
      </MissionContext.Provider>

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
          taskPick={taskPick}
          onOpenMapPicker={(payload) => {
            setModal(null);
            setMapObstaclePickerResume(null);
            setMapPickerResume(payload.resume ?? null);
            navigate(ROUTES.map);
            setMapTool({
              kind: 'task',
              taskType: payload.taskType,
              plannedRoute: payload.plannedRouteEnabled,
              step: 'main',
              radius: payload.radius,
            });
            setMapDraftPts(payload.mainPts);
            setMapPlannedPts(payload.plannedPts);
            setMapCreateOpen(true);
          }}
          onOpenObstacleMapPicker={(payload) => {
            setModal(null);
            setMapPickerResume(null);
            setMapObstaclePickerResume(payload.resume);
            navigate(ROUTES.map);
            setMapTool({ kind: 'obstacle' });
            setMapDraftPts(payload.obstacleDraftPts);
            setMapPlannedPts([]);
            setMapCreateOpen(true);
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
                    if (cur.entity === 'events') {
                      navigate(ROUTES.entityList('events'));
                    }
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
    </>
  );
}
