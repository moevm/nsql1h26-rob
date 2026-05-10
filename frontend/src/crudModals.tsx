import React, { useEffect, useMemo, useState } from 'react';
import { DESCRIPTION_MAX_LEN } from './appConstants';
import { OidSuggestInput } from './components/OidSuggestInput';
import { apiPatch, apiPost } from './apiCrud';
import { isObjectIdHex } from './entityUtils';
import { sanitizeBracketPointsTyping, sanitizeDecimalTyping, sanitizeNonNegIntTyping } from './coordinateInput';
import { bsonId, dateToInput, localInputToIso, refId } from './mongoJson';

export type EntityKey = 'groups' | 'robots' | 'tasks' | 'events' | 'obstacles' | 'files';

const GROUP_STATUS = ['active', 'inactive', 'paused', 'error'] as const;
const TASK_TYPES = ['moveToTarget', 'patrol', 'scanRadius', 'custom'] as const;
const TASK_STATUS = ['active', 'paused', 'completed', 'cancelled', 'failed'] as const;

const inp = 'bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 w-full';
const lbl = 'text-[10px] text-slate-500 block mb-0.5';

function dateInp(value: string): string {
  return `${inp} ${value.trim() ? '' : 'text-slate-500'}`;
}

function safeNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function parsePointsJson(pointsJson: string): { ok: true; points: { x: number; y: number }[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(pointsJson);
  } catch {
    return { ok: false, error: 'Invalid JSON for plannedRoute.points' };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'plannedRoute.points must be an array' };
  }
  const pts: { x: number; y: number }[] = [];
  for (const item of raw) {
    if (Array.isArray(item) && item.length === 2) {
      const nx = Number(item[0]);
      const ny = Number(item[1]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
        return { ok: false, error: 'Each [x,y] pair must contain numbers' };
      }
      pts.push({ x: clampInt(nx), y: clampInt(ny) });
      continue;
    }
    if (!item || typeof item !== 'object') return { ok: false, error: 'Each point must be {x,y} or [x,y]' };
    const x = (item as { x?: unknown }).x;
    const y = (item as { y?: unknown }).y;
    if (typeof x !== 'number' || typeof y !== 'number') return { ok: false, error: 'Each point must have numeric x and y' };
    pts.push({ x: clampInt(x), y: clampInt(y) });
  }
  return { ok: true, points: pts };
}

function patrolRouteToBracketJson(route: unknown): string {
  if (!Array.isArray(route) || route.length === 0) return '[]';
  const pairs: number[][] = [];
  for (const p of route) {
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const o = p as Record<string, unknown>;
      const x = Number(o.x);
      const y = Number(o.y);
      if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([clampInt(x), clampInt(y)]);
    } else if (Array.isArray(p) && p.length === 2) {
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([clampInt(x), clampInt(y)]);
    }
  }
  return JSON.stringify(pairs);
}

function parseObstaclePoints(pointsJson: string): { ok: true; points: [number, number][] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(pointsJson);
  } catch {
    return { ok: false, error: 'Invalid JSON for obstacle points' };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'points must be an array of [x,y]' };
  }
  const pts: [number, number][] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) return { ok: false, error: 'Each point must be [x,y]' };
    const [x, y] = item;
    if (typeof x !== 'number' || typeof y !== 'number') return { ok: false, error: 'Each point must be [x,y] numbers' };
    pts.push([clampInt(x), clampInt(y)]);
  }
  return { ok: true, points: pts };
}

function samePt(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function validateClosedPolygon(points: [number, number][]): { ok: true } | { ok: false; error: string } {
  if (points.length < 4) {
    return { ok: false, error: 'Obstacle polygon must have at least 4 points (including the closing point)' };
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (!samePt(first, last)) {
    return { ok: false, error: 'Obstacle polygon must be closed: first and last points must match' };
  }

  const counts = new Map<string, number>();
  for (const [x, y] of points) {
    const k = `${x},${y}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [k, c] of counts.entries()) {
    if (c > 2) {
      return { ok: false, error: `Point ${k} is repeated ${c} times (max is 2)` };
    }
  }
  const fk = `${first[0]},${first[1]}`;
  if ((counts.get(fk) ?? 0) !== 2) {
    return { ok: false, error: 'Only the closing point should repeat (exactly twice: first and last)' };
  }
  for (const [k, c] of counts.entries()) {
    if (k === fk) continue;
    if (c !== 1) {
      return { ok: false, error: `Point ${k} is repeated ${c} times (should be 1)` };
    }
  }
  return { ok: true };
}

function obstacleBounds(points: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

type ModalState = {
  mode: 'create' | 'edit';
  entity: EntityKey;
  doc?: Record<string, unknown>;
};

export type MapPickerTaskResume = {
  modalMode: 'create' | 'edit';
  seedDoc: Record<string, unknown>;
};

export type MapPickerTaskPayload = {
  taskType: (typeof TASK_TYPES)[number];
  plannedRouteEnabled: boolean;
  radius: number;
  mainPts: { x: number; y: number }[];
  plannedPts: { x: number; y: number }[];
  resume?: MapPickerTaskResume;
};

export type MapPickerObstacleResume = {
  modalMode: 'create' | 'edit';
  seedDoc: Record<string, unknown>;
};

export type MapPickerObstaclePayload = {
  resume: MapPickerObstacleResume;
  obstacleDraftPts: { x: number; y: number }[];
};

function obstaclePairsToDraftPts(pairs: [number, number][]): { x: number; y: number }[] {
  if (pairs.length < 2) return pairs.map(([x, y]) => ({ x, y }));
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  const open = last[0] === first[0] && last[1] === first[1] ? pairs.slice(0, -1) : pairs;
  return open.map(([x, y]) => ({ x, y }));
}

export function CrudModal({
  modal,
  onClose,
  onSaved,
  groupPick,
  robotPick,
  taskPick = [],
  onOpenMapPicker,
  onOpenObstacleMapPicker,
}: {
  modal: ModalState;
  onClose: () => void;
  onSaved: () => void;
  groupPick: { id: string; name: string }[];
  robotPick: { id: string; name: string }[];
  taskPick?: { id: string; name: string }[];
  onOpenMapPicker?: (payload: MapPickerTaskPayload) => void;
  onOpenObstacleMapPicker?: (payload: MapPickerObstaclePayload) => void;
}) {
  switch (modal.entity) {
    case 'groups':
      return <GroupsModal modal={modal} onClose={onClose} onSaved={onSaved} />;
    case 'robots':
      return <RobotsModal modal={modal} onClose={onClose} onSaved={onSaved} groupPick={groupPick} />;
    case 'tasks':
      return (
        <TasksModal
          modal={modal}
          onClose={onClose}
          onSaved={onSaved}
          groupPick={groupPick}
          robotPick={robotPick}
          onOpenMapPicker={onOpenMapPicker}
        />
      );
    case 'events':
      return <EventsModal modal={modal} onClose={onClose} onSaved={onSaved} robotPick={robotPick} taskPick={taskPick} />;
    case 'obstacles':
      return (
        <ObstaclesModal
          modal={modal}
          onClose={onClose}
          onSaved={onSaved}
          onOpenObstacleMapPicker={onOpenObstacleMapPicker}
        />
      );
    case 'files':
      return null;
    default:
      return null;
  }
}

function EventsModal({
  modal,
  onClose,
  onSaved,
  robotPick,
  taskPick,
}: {
  modal: ModalState;
  onClose: () => void;
  onSaved: () => void;
  robotPick: { id: string; name: string }[];
  taskPick: { id: string; name: string }[];
}) {
  if (modal.mode !== 'create') {
    return null;
  }
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [robotId, setRobotId] = useState('');
  const [taskId, setTaskId] = useState('');

  const save = async () => {
    setErr(null);
    const rid = robotId.trim();
    const tid = taskId.trim();
    if (rid && !isObjectIdHex(rid)) {
      setErr('robotId must be a 24-character ObjectId hex or empty.');
      return;
    }
    if (tid && !isObjectIdHex(tid)) {
      setErr('taskId must be a 24-character ObjectId hex or empty.');
      return;
    }
    if (description.length > DESCRIPTION_MAX_LEN) {
      setErr(`Description must be at most ${DESCRIPTION_MAX_LEN} characters.`);
      return;
    }
    try {
      await apiPost('/api/events', {
        type: 'info',
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(rid ? { robotId: rid } : {}),
        ...(tid ? { taskId: tid } : {}),
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-4 space-y-3 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-100">New info event</h3>
        <p className="text-[11px] text-slate-500">Only the <span className="text-slate-400">info</span> event type may be created.</p>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <label>
          <span className={lbl}>type</span>
          <input className={inp} value="info" readOnly aria-readonly />
        </label>
        <label>
          <span className={lbl}>message</span>
          <input className={inp} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional summary" />
        </label>
        <label>
          <span className={lbl}>description</span>
          <textarea className={inp} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          <span className={lbl}>robotId</span>
          <OidSuggestInput className={inp} value={robotId} onChange={setRobotId} placeholder="ObjectId hex or pick…" options={robotPick} />
        </label>
        <label>
          <span className={lbl}>taskId</span>
          <OidSuggestInput className={inp} value={taskId} onChange={setTaskId} placeholder="ObjectId hex or pick…" options={taskPick} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-400" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-xs px-3 py-1.5 rounded bg-[#137fec] text-white font-medium" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupsModal({
  modal,
  onClose,
  onSaved,
}: {
  modal: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mode, doc } = modal;
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(mode === 'edit' && doc ? String(doc.name ?? '') : '');
  const [description, setDescription] = useState(mode === 'edit' && doc ? String(doc.description ?? '') : '');
  const [status, setStatus] = useState(mode === 'edit' && doc ? String(doc.status ?? 'active') : 'active');

  const save = async () => {
    setErr(null);
    try {
      const n = name.trim();
      if (!n) {
        setErr('name is required');
        return;
      }
      if (description.length > DESCRIPTION_MAX_LEN) {
        setErr(`Description must be at most ${DESCRIPTION_MAX_LEN} characters.`);
        return;
      }
      const payload = { name, description: description || null, status };
      if (mode === 'create') {
        await apiPost('/api/groups', payload);
      } else if (doc) {
        await apiPatch(`/api/groups/${bsonId(doc)}`, payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-4 space-y-3 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-100">{mode === 'create' ? 'New group' : 'Edit group'}</h3>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <label>
          <span className={lbl}>name</span>
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className={lbl}>description</span>
          <textarea className={inp} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          <span className={lbl}>status</span>
          <select className={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
            {GROUP_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-400" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-xs px-3 py-1.5 rounded bg-[#137fec] text-white font-medium" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RobotsModal({
  modal,
  onClose,
  onSaved,
  groupPick,
}: {
  modal: ModalState;
  onClose: () => void;
  onSaved: () => void;
  groupPick: { id: string; name: string }[];
}) {
  const { mode, doc } = modal;
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(mode === 'edit' && doc ? String(doc.name ?? '') : '');
  const [model, setModel] = useState(mode === 'edit' && doc ? String(doc.model ?? '') : '');
  const [groupId, setGroupId] = useState(mode === 'edit' && doc ? refId(doc.groupId) : '');
  const [scanRadius, setScanRadius] = useState(mode === 'edit' && doc && doc.scanRadius != null ? String(doc.scanRadius) : '');
  const [weight, setWeight] = useState(mode === 'edit' && doc && doc.weight != null ? String(doc.weight) : '');
  const save = async () => {
    setErr(null);
    const n = name.trim();
    const m = model.trim();
    const gid = groupId.trim();
    if (!n) {
      setErr('name is required');
      return;
    }
    if (!m) {
      setErr('model is required');
      return;
    }
    if (!gid) {
      setErr('groupId is required');
      return;
    }
    const srRaw = scanRadius.trim();
    const wRaw = weight.trim();
    if (!srRaw) {
      setErr('scanRadius is required');
      return;
    }
    if (!wRaw) {
      setErr('weight is required');
      return;
    }
    const p: Record<string, unknown> = {
      name: n,
      model: m,
      groupId: gid,
    };
    const sr = Number(srRaw);
    const w = Number(wRaw);
    if (!Number.isFinite(sr)) {
      setErr('scanRadius must be a number');
      return;
    }
    if (!Number.isFinite(w) || !Number.isInteger(w)) {
      setErr('weight must be an integer');
      return;
    }
    p.scanRadius = sr;
    p.weight = w;
    try {
      if (mode === 'create') {
        await apiPost('/api/robots', p);
      } else if (doc) {
        await apiPatch(`/api/robots/${bsonId(doc)}`, p);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-4 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-semibold text-slate-100">{mode === 'create' ? 'New robot' : 'Edit robot'}</h3>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <label>
          <span className={lbl}>name</span>
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className={lbl}>model</span>
          <input className={inp} value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label>
          <span className={lbl}>groupId</span>
          <OidSuggestInput
            className={inp}
            value={groupId}
            onChange={setGroupId}
            placeholder="ObjectId hex or pick a hint…"
            options={groupPick}
          />
        </label>
        <label>
          <span className={lbl}>scanRadius</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className={inp}
            value={scanRadius}
            onChange={(e) => setScanRadius(sanitizeDecimalTyping(e.target.value))}
          />
        </label>
        <label>
          <span className={lbl}>weight</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            className={inp}
            value={weight}
            onChange={(e) => setWeight(sanitizeNonNegIntTyping(e.target.value))}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-400" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-xs px-3 py-1.5 rounded bg-[#137fec] text-white font-medium" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function TasksModal({
  modal,
  onClose,
  onSaved,
  groupPick,
  onOpenMapPicker,
}: {
  modal: ModalState;
  onClose: () => void;
  onSaved: () => void;
  groupPick: { id: string; name: string }[];
  onOpenMapPicker?: (payload: MapPickerTaskPayload) => void;
}) {
  const { mode, doc } = modal;
  const seedDoc = doc ?? {};
  const createMode = mode === 'create';
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(String((seedDoc as any).name ?? ''));
  const [groupId, setGroupId] = useState(refId((seedDoc as any).groupId));
  const [type, setType] = useState(String((seedDoc as any).type ?? 'patrol'));
  const [taskStatus, setTaskStatus] = useState(String((seedDoc as any).taskStatus ?? 'active'));
  const td = ((seedDoc as any).taskDetails ?? null) as any;

  const [targetX, setTargetX] = useState(
    td?.targetPosition?.x != null ? sanitizeNonNegIntTyping(String(td.targetPosition.x)) : '',
  );
  const [targetY, setTargetY] = useState(
    td?.targetPosition?.y != null ? sanitizeNonNegIntTyping(String(td.targetPosition.y)) : '',
  );

  const [patrolUntil, setPatrolUntil] = useState(mode === 'edit' && doc ? dateToInput((td as any)?.until) : '');
  const [patrolRouteJson, setPatrolRouteJson] = useState(() =>
    Array.isArray(td?.route) ? patrolRouteToBracketJson(td.route) : '[]',
  );
  const [patrolRoute, setPatrolRoute] = useState<{ x: number; y: number }[]>(() => {
    const parsed = parsePointsJson(patrolRouteJson);
    return parsed.ok ? parsed.points : [];
  });

  const [centerX, setCenterX] = useState(td?.center?.x != null ? sanitizeNonNegIntTyping(String(td.center.x)) : '');
  const [centerY, setCenterY] = useState(td?.center?.y != null ? sanitizeNonNegIntTyping(String(td.center.y)) : '');
  const [radius, setRadius] = useState(td?.radius != null ? sanitizeNonNegIntTyping(String(td.radius)) : '');

  const [parameters, setParameters] = useState(td?.parameters != null ? String(td.parameters) : '');
  const seedPlannedPts = (() => {
    const pr = (seedDoc as any).plannedRoute;
    const pts = pr && typeof pr === 'object' && Array.isArray((pr as any).points) ? (pr as any).points : null;
    return Array.isArray(pts) ? pts : null;
  })();
  const [plannedRouteEnabled, setPlannedRouteEnabled] = useState(() => Boolean(seedPlannedPts && seedPlannedPts.length));
  const [plannedRouteJson, setPlannedRouteJson] = useState(() =>
    seedPlannedPts && seedPlannedPts.length ? sanitizeBracketPointsTyping(JSON.stringify(seedPlannedPts)) : '',
  );

  const resetDetailsForType = (nextType: string) => {
    setErr(null);
    if (nextType === 'moveToTarget') {
      setTargetX('');
      setTargetY('');
    } else if (nextType === 'patrol') {
      setPatrolUntil('');
      setPatrolRoute([]);
      setPatrolRouteJson('[]');
    } else if (nextType === 'scanRadius') {
      setCenterX('');
      setCenterY('');
      setRadius('');
    } else if (nextType === 'custom') {
      setParameters('');
    }
  };

  const addExecRobot = () => {};

  const save = async () => {
    setErr(null);
    try {
      const n = name.trim();
      if (!n) {
        setErr('name is required');
        return;
      }
      const gid = groupId.trim();
      if (!gid) {
        setErr('groupId is required');
        return;
      }
      const taskDetails: Record<string, unknown> = {};
      if (type === 'moveToTarget') {
        const tx = safeNum(targetX);
        const ty = safeNum(targetY);
        if (tx == null || ty == null) {
          setErr('moveToTarget requires targetPosition.x and targetPosition.y');
          return;
        }
        taskDetails.targetPosition = { x: clampInt(tx), y: clampInt(ty) };
      } else if (type === 'patrol') {
        const parsed = parsePointsJson(patrolRouteJson);
        if (!parsed.ok) {
          setErr(parsed.error);
          return;
        }
        if (!parsed.points.length) {
          setErr('patrol requires non-empty route');
          return;
        }
        const untilIso = patrolUntil ? localInputToIso(patrolUntil) : undefined;
        if (!untilIso) {
          setErr('patrol requires valid until');
          return;
        }
        taskDetails.route = parsed.points;
        taskDetails.until = untilIso;
      } else if (type === 'scanRadius') {
        const cx = safeNum(centerX);
        const cy = safeNum(centerY);
        const r = safeNum(radius);
        if (cx == null || cy == null || r == null) {
          setErr('scanRadius requires center.x, center.y, radius');
          return;
        }
        taskDetails.center = { x: clampInt(cx), y: clampInt(cy) };
        taskDetails.radius = clampInt(r);
      } else if (type === 'custom') {
        const p = parameters ?? '';
        if (p.length > 512) {
          setErr('custom.parameters must be <= 512 characters');
          return;
        }
        taskDetails.parameters = p;
      }

      let plannedRoute: Record<string, unknown> | null = null;
      const rawPr = plannedRouteJson.trim();
      if (rawPr) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawPr);
        } catch {
          setErr('plannedRoute.points must be valid JSON');
          return;
        }
        if (!Array.isArray(parsed)) {
          setErr('plannedRoute.points must be an array of [x,y]');
          return;
        }
        for (const item of parsed) {
          if (!Array.isArray(item) || item.length !== 2) {
            setErr('plannedRoute.points items must be [x,y]');
            return;
          }
          const [x, y] = item as [unknown, unknown];
          if (typeof x !== 'number' || typeof y !== 'number') {
            setErr('plannedRoute.points items must be numbers');
            return;
          }
        }
        plannedRoute = { points: parsed };
      }

      const payload: Record<string, unknown> = {
        name: n,
        groupId: gid,
        type,
        taskStatus,
        taskDetails,
        executionRobots: mode === 'edit' && doc ? (((doc as any).executionRobots as unknown) ?? []) : [],
        plannedRoute,
      };
      if (mode === 'create') {
        await apiPost('/api/tasks', payload);
      } else if (doc) {
        await apiPatch(`/api/tasks/${bsonId(doc)}`, payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-4 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">{mode === 'create' ? 'New task' : 'Edit task'}</h3>
          {onOpenMapPicker && (
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
              onClick={() => {
                const tt = (type as (typeof TASK_TYPES)[number]) || 'moveToTarget';
                let mainPts: { x: number; y: number }[] = [];
                if (tt === 'moveToTarget') {
                  const tx = safeNum(targetX);
                  const ty = safeNum(targetY);
                  if (tx != null && ty != null) mainPts = [{ x: clampInt(tx), y: clampInt(ty) }];
                } else if (tt === 'scanRadius') {
                  const cx = safeNum(centerX);
                  const cy = safeNum(centerY);
                  if (cx != null && cy != null) mainPts = [{ x: clampInt(cx), y: clampInt(cy) }];
                } else if (tt === 'patrol') {
                  const parsed = parsePointsJson(patrolRouteJson);
                  if (parsed.ok) mainPts = parsed.points;
                }
                let plannedPts: { x: number; y: number }[] = [];
                if (plannedRouteEnabled) {
                  try {
                    const parsed = JSON.parse(plannedRouteJson || '[]');
                    if (Array.isArray(parsed)) {
                      const out: { x: number; y: number }[] = [];
                      for (const item of parsed) {
                        if (!Array.isArray(item) || item.length !== 2) continue;
                        const [x, y] = item as [unknown, unknown];
                        if (typeof x === 'number' && typeof y === 'number') out.push({ x: clampInt(x), y: clampInt(y) });
                      }
                      plannedPts = out;
                    }
                  } catch {
                    plannedPts = [];
                  }
                }
                const r = safeNum(radius);
                const taskDetailsPartial: Record<string, unknown> = {};
                if (type === 'moveToTarget') {
                  const tx = safeNum(targetX);
                  const ty = safeNum(targetY);
                  if (tx != null && ty != null) {
                    taskDetailsPartial.targetPosition = { x: clampInt(tx), y: clampInt(ty) };
                  }
                } else if (type === 'patrol') {
                  const parsed = parsePointsJson(patrolRouteJson);
                  if (parsed.ok && parsed.points.length) {
                    taskDetailsPartial.route = parsed.points;
                  }
                  const untilIso = patrolUntil ? localInputToIso(patrolUntil) : undefined;
                  if (untilIso) {
                    taskDetailsPartial.until = untilIso;
                  } else if (mode === 'edit' && td && (td as any).until != null) {
                    taskDetailsPartial.until = (td as any).until;
                  }
                } else if (type === 'scanRadius') {
                  const cx = safeNum(centerX);
                  const cy = safeNum(centerY);
                  const rad = safeNum(radius);
                  if (cx != null && cy != null) {
                    taskDetailsPartial.center = { x: clampInt(cx), y: clampInt(cy) };
                  }
                  if (rad != null) {
                    taskDetailsPartial.radius = clampInt(rad);
                  }
                } else if (type === 'custom') {
                  taskDetailsPartial.parameters = parameters;
                }
                let snapshotPlanned: Record<string, unknown> | null = null;
                if (plannedRouteEnabled) {
                  const rawPrSnap = plannedRouteJson.trim();
                  if (rawPrSnap) {
                    try {
                      const parsedPr = JSON.parse(rawPrSnap);
                      if (Array.isArray(parsedPr)) {
                        snapshotPlanned = { points: parsedPr };
                      }
                    } catch {
                      snapshotPlanned = null;
                    }
                  } else if (mode === 'edit' && (seedDoc as any).plannedRoute && typeof (seedDoc as any).plannedRoute === 'object') {
                    snapshotPlanned = (seedDoc as any).plannedRoute as Record<string, unknown>;
                  }
                }
                const baseDoc = doc && mode === 'edit' ? { ...doc } : {};
                const gidTrim = groupId.trim();
                const seedDocSnapshot: Record<string, unknown> = {
                  ...baseDoc,
                  name: name.trim() || (doc ? String((doc as any).name ?? '') : ''),
                  ...(gidTrim ? { groupId: gidTrim } : doc ? { groupId: (doc as any).groupId } : {}),
                  type,
                  taskStatus,
                  taskDetails: { ...(((doc as any)?.taskDetails as object) ?? {}), ...taskDetailsPartial },
                  plannedRoute: snapshotPlanned,
                  executionRobots:
                    mode === 'edit' && doc && Array.isArray((doc as any).executionRobots)
                      ? (doc as any).executionRobots
                      : ((doc as any)?.executionRobots ?? []),
                };
                const resumePayload: MapPickerTaskResume = {
                  modalMode: mode === 'edit' ? 'edit' : 'create',
                  seedDoc: seedDocSnapshot,
                };
                onOpenMapPicker({
                  taskType: tt,
                  plannedRouteEnabled,
                  radius: r != null ? Math.max(1, clampInt(r)) : 8,
                  mainPts,
                  plannedPts,
                  resume: resumePayload,
                });
              }}
              title="Switch to Map and pick points by clicks"
            >
              Open map picker
            </button>
          )}
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <label>
          <span className={lbl}>name</span>
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className={lbl}>groupId</span>
          <OidSuggestInput
            className={inp}
            value={groupId}
            onChange={setGroupId}
            placeholder="ObjectId hex or pick a hint…"
            options={groupPick}
          />
        </label>
        <label>
          <span className={lbl}>type</span>
          <select
            className={inp}
            value={type}
            onChange={(e) => {
              const next = e.target.value;
              setType(next);
              if (mode !== 'create') {
                return;
              }
              resetDetailsForType(next);
            }}
          >
            {TASK_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>taskStatus</span>
          <select className={inp} value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)}>
            {TASK_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="pt-2 border-t border-slate-800" />

        <div className="pt-2 border-t border-slate-800 space-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={plannedRouteEnabled}
              onChange={(e) => {
                const next = e.target.checked;
                setPlannedRouteEnabled(next);
                if (!next) {
                  setPlannedRouteJson('');
                } else if (!plannedRouteJson.trim()) {
                  setPlannedRouteJson('[]');
                }
              }}
            />
            Add planned route (optional)
          </label>
          {plannedRouteEnabled && (
            <label>
              <span className={lbl}>plannedRoute.points ([[x,y],…] only)</span>
              <textarea
                className={inp}
                rows={4}
                value={plannedRouteJson}
                onChange={(e) => setPlannedRouteJson(sanitizeBracketPointsTyping(e.target.value))}
              />
              {createMode && <div className="text-[11px] text-slate-600 mt-1">Tip: you can also fill it by clicks on the Map tab.</div>}
            </label>
          )}
        </div>

        {type === 'moveToTarget' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label>
              <span className={lbl}>taskDetails.targetPosition.x</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                className={inp}
                value={targetX}
                onChange={(e) => setTargetX(sanitizeNonNegIntTyping(e.target.value))}
              />
            </label>
            <label>
              <span className={lbl}>taskDetails.targetPosition.y</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                className={inp}
                value={targetY}
                onChange={(e) => setTargetY(sanitizeNonNegIntTyping(e.target.value))}
              />
            </label>
          </div>
        )}

        {type === 'patrol' && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label>
              <span className={lbl}>taskDetails.until</span>
              <input type="datetime-local" className={dateInp(patrolUntil)} value={patrolUntil} onChange={(e) => setPatrolUntil(e.target.value)} />
            </label>
            <label>
              <span className={lbl}>taskDetails.route (only [[x,y],…])</span>
              <textarea
                className={inp}
                rows={10}
                value={patrolRouteJson}
                onChange={(e) => {
                  const v = sanitizeBracketPointsTyping(e.target.value);
                  setPatrolRouteJson(v);
                  const parsed = parsePointsJson(v);
                  if (parsed.ok) {
                    setPatrolRoute(parsed.points);
                  }
                }}
              />
              {createMode && <div className="text-[11px] text-slate-600 mt-1">Tip: you can also build route by clicks on the Map tab.</div>}
            </label>
          </div>
        )}

        {type === 'scanRadius' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-slate-800">
            <label>
              <span className={lbl}>taskDetails.center.x</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                className={inp}
                value={centerX}
                onChange={(e) => setCenterX(sanitizeNonNegIntTyping(e.target.value))}
              />
            </label>
            <label>
              <span className={lbl}>taskDetails.center.y</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                className={inp}
                value={centerY}
                onChange={(e) => setCenterY(sanitizeNonNegIntTyping(e.target.value))}
              />
            </label>
            <label>
              <span className={lbl}>taskDetails.radius</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                className={inp}
                value={radius}
                onChange={(e) => setRadius(sanitizeNonNegIntTyping(e.target.value))}
              />
            </label>
          </div>
        )}

        {type === 'custom' && (
          <label className="pt-2 border-t border-slate-800">
            <span className={lbl}>taskDetails.parameters (&lt;=512 chars)</span>
            <textarea className={inp} rows={6} value={parameters} onChange={(e) => setParameters(e.target.value)} />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-400" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-xs px-3 py-1.5 rounded bg-[#137fec] text-white font-medium" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ObstaclesModal({
  modal,
  onClose,
  onSaved,
  onOpenObstacleMapPicker,
}: {
  modal: ModalState;
  onClose: () => void;
  onSaved: () => void;
  onOpenObstacleMapPicker?: (payload: MapPickerObstaclePayload) => void;
}) {
  const { mode, doc } = modal;
  const seed = (doc ?? {}) as Record<string, unknown>;
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(String(seed.name ?? ''));
  const [pointsJson, setPointsJson] = useState(
    seed.points
      ? sanitizeBracketPointsTyping(JSON.stringify(seed.points))
      : '[[0,0],[10,0],[10,5],[0,5],[0,0]]',
  );
  const [active, setActive] = useState(seed.active == null ? true : Boolean(seed.active));

  const boundsPreview = useMemo(() => {
    const parsed = parseObstaclePoints(pointsJson);
    if (!parsed.ok) return null;
    return obstacleBounds(parsed.points);
  }, [pointsJson]);

  const save = async () => {
    setErr(null);
    const n = name.trim();
    const parsed = parseObstaclePoints(pointsJson);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    const closed = validateClosedPolygon(parsed.points);
    if (!closed.ok) {
      setErr(closed.error);
      return;
    }
    const b = obstacleBounds(parsed.points);
    if (b.maxX <= b.minX || b.maxY <= b.minY) {
      setErr('Obstacle bounds look degenerate (min >= max)');
      return;
    }
    const payload = {
      name: n || null,
      points: parsed.points,
      minX: b.minX,
      maxX: b.maxX,
      minY: b.minY,
      maxY: b.maxY,
      active,
    };
    try {
      if (mode === 'create') {
        await apiPost('/api/obstacles', payload);
      } else if (doc) {
        await apiPatch(`/api/obstacles/${bsonId(doc)}`, payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-4 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">{mode === 'create' ? 'New obstacle' : 'Edit obstacle'}</h3>
          {onOpenObstacleMapPicker && (
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 shrink-0"
              onClick={() => {
                const parsed = parseObstaclePoints(pointsJson);
                const obstacleDraftPts = parsed.ok ? obstaclePairsToDraftPts(parsed.points) : [];
                const baseDoc = doc && mode === 'edit' ? { ...doc } : {};
                const n = name.trim();
                const seedDocSnapshot: Record<string, unknown> = {
                  ...baseDoc,
                  name: n || null,
                  active,
                  ...(parsed.ok ? { points: parsed.points } : {}),
                };
                onOpenObstacleMapPicker({
                  resume: {
                    modalMode: mode === 'edit' ? 'edit' : 'create',
                    seedDoc: seedDocSnapshot,
                  },
                  obstacleDraftPts,
                });
              }}
              title="Switch to Map and pick polygon vertices by clicks"
            >
              Open map picker
            </button>
          )}
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <label>
          <span className={lbl}>name</span>
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className={lbl}>points ([[x,y],…])</span>
          <textarea
            className={inp}
            rows={10}
            value={pointsJson}
            onChange={(e) => {
              const v = sanitizeBracketPointsTyping(e.target.value);
              setPointsJson(v);
            }}
          />
        </label>
        <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-2 text-[11px] text-slate-400 space-y-1">
          <div className="font-medium text-slate-500 uppercase tracking-wide">Bounding box</div>
          {boundsPreview ? (
            <div className="font-mono text-slate-300">
              minX {boundsPreview.minX} · maxX {boundsPreview.maxX} · minY {boundsPreview.minY} · maxY {boundsPreview.maxY}
            </div>
          ) : (
            <div className="text-slate-500">Fix points JSON to see bounds</div>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          active
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-400" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-xs px-3 py-1.5 rounded bg-[#137fec] text-white font-medium" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
