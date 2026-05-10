import { FILTER_INP } from './appConstants';

export function dateInputClass(value: string): string {
  return `${FILTER_INP} ${value.trim() ? '' : 'text-slate-500'}`;
}

export function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) {
    return undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function isObjectIdHex(s: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(s.trim());
}

export function isRouteFilterValid(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (!s.endsWith(';')) return false;
  const parts = s.split(';');
  if (parts.length < 2) return false;
  if (parts[parts.length - 1].trim() !== '') return false;
  const coordRe = /^\s*-?\d+\s*,\s*-?\d+\s*$/;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!coordRe.test(parts[i])) return false;
  }
  return true;
}

export function isImageFilename(name: unknown): boolean {
  const s = String(name ?? '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(s);
}

/** BSON/EJSON numeric leaf (or plain number/string) → finite number */
export function unwrapNumericLeaf(val: unknown): number | null {
  if (val == null) {
    return null;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>;
    if ('$numberDouble' in o) return unwrapNumericLeaf(o.$numberDouble);
    if ('$numberInt' in o) return unwrapNumericLeaf(o.$numberInt);
    if ('$numberLong' in o) return unwrapNumericLeaf(o.$numberLong);
  }
  return null;
}

/** Live coordinates from robot doc; null if missing/invalid (caller may fall back to OID-derived placeholder). */
export function robotCoordinatesFromDoc(doc: Record<string, unknown>): { x: number; y: number } | null {
  const c = doc.coordinates;
  if (!c || typeof c !== 'object' || c === null) {
    return null;
  }
  const o = c as Record<string, unknown>;
  const x = unwrapNumericLeaf(o.x);
  const y = unwrapNumericLeaf(o.y);
  if (x === null || y === null) {
    return null;
  }
  return { x, y };
}

export function boundsFromPoints(pts: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
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

export function parseTaskSpatial(task: Record<string, unknown>): {
  main: { x: number; y: number }[];
  planned: [number, number][];
  scan?: { cx: number; cy: number; r: number };
} {
  const td = task.taskDetails as Record<string, unknown> | undefined;
  const typ = String(task.type ?? '');
  const main: { x: number; y: number }[] = [];
  if (typ === 'moveToTarget' && td && td.targetPosition && typeof td.targetPosition === 'object') {
    const tp = td.targetPosition as Record<string, unknown>;
    const x = Number(tp.x);
    const y = Number(tp.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      main.push({ x, y });
    }
  } else if (td && Array.isArray(td.route)) {
    for (const p of td.route) {
      if (p && typeof p === 'object' && p !== null && 'x' in p && 'y' in p) {
        const x = Number((p as Record<string, unknown>).x);
        const y = Number((p as Record<string, unknown>).y);
        if (Number.isFinite(x) && Number.isFinite(y)) main.push({ x, y });
      }
    }
  }
  const pr = task.plannedRoute as { points?: unknown } | undefined;
  const planned: [number, number][] = [];
  if (pr && Array.isArray(pr.points)) {
    for (const p of pr.points) {
      if (Array.isArray(p) && p.length === 2) {
        const x = Number(p[0]);
        const y = Number(p[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) planned.push([x, y]);
      }
    }
  }
  let scan: { cx: number; cy: number; r: number } | undefined;
  if (typ === 'scanRadius' && td && td.center && typeof td.center === 'object') {
    const c = td.center as Record<string, unknown>;
    const r = Number(td.radius ?? 0);
    const cx = Number(c.x);
    const cy = Number(c.y);
    if (Number.isFinite(r) && r > 0 && Number.isFinite(cx) && Number.isFinite(cy)) {
      scan = { cx, cy, r };
    }
  }
  return { main, planned, scan };
}
