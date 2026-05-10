export const MAP_COLS = 96;
export const MAP_ROWS = 60;
export const MAP_CELL = 20;
export const MAP_W = MAP_COLS * MAP_CELL;
export const MAP_H = MAP_ROWS * MAP_CELL;

export const MAP_AXIS_PAD_LEFT = 52;
export const MAP_AXIS_PAD_BOTTOM = 40;
export const MAP_CONTENT_WIDTH = MAP_AXIS_PAD_LEFT + MAP_W;
export const MAP_CONTENT_HEIGHT = MAP_H + MAP_AXIS_PAD_BOTTOM;

export const MAP_ZOOM_MIN = 0.5;
export const MAP_ZOOM_MAX = 3;
export const MAP_POLL_INTERVAL_MS = 4000;
export const MAP_VIEW_STORAGE_KEY = 'nsql1h26-rob-map-view';

export function readStoredMapView(): { zoom: number; offset: { x: number; y: number } } {
  try {
    const raw = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) {
      return { zoom: 1, offset: { x: 0, y: 0 } };
    }
    const j = JSON.parse(raw) as { zoom?: unknown; offset?: unknown };
    let zoom = Number(j.zoom);
    if (!Number.isFinite(zoom)) {
      zoom = 1;
    }
    zoom = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, zoom));
    const off = j.offset && typeof j.offset === 'object' && j.offset !== null ? (j.offset as Record<string, unknown>) : null;
    const ox = off ? Number(off.x) : 0;
    const oy = off ? Number(off.y) : 0;
    return {
      zoom,
      offset: {
        x: Number.isFinite(ox) ? ox : 0,
        y: Number.isFinite(oy) ? oy : 0,
      },
    };
  } catch {
    return { zoom: 1, offset: { x: 0, y: 0 } };
  }
}

export type MapPickLayer = 'all' | 'robots' | 'tasks' | 'obstacles';
