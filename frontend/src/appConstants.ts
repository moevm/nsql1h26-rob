import type { EntityKey } from './crudModals';

export const FILTER_INP =
  'bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 w-full min-w-0';
export const FILTER_LBL = 'text-[10px] text-slate-500 uppercase tracking-wide block mb-0.5';

export const DESCRIPTION_MAX_LEN = 512;

export const ENTITY_LABEL: Record<EntityKey, string> = {
  groups: 'Groups',
  robots: 'Robots',
  tasks: 'Tasks',
  events: 'Events',
  obstacles: 'Obstacles',
  files: 'Visual logs',
};

export const GROUP_STATUS = ['active', 'inactive', 'paused', 'error'] as const;
export const TASK_TYPES = ['moveToTarget', 'patrol', 'scanRadius', 'custom'] as const;
export const TASK_STATUS = ['active', 'paused', 'completed', 'cancelled', 'failed'] as const;
export const EVENT_TYPES = [
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

export const COLS: Record<EntityKey, string[]> = {
  groups: ['name', 'description', 'status', 'createdAt', 'updatedAt', '_id'],
  robots: ['name', 'model', 'groupName', 'groupId', 'scanRadius', 'weight', 'robotStatus', 'createdAt', 'updatedAt', '_id'],
  tasks: ['name', 'type', 'taskStatus', 'route', 'groupName', 'groupId', 'startTime', 'endTime', 'createdAt', 'updatedAt', '_id'],
  events: ['type', 'message', 'description', 'robotId', 'taskId', 'gridFsFileId', 'timestamp', '_id'],
  obstacles: ['name', 'active', 'minX', 'maxX', 'minY', 'maxY', 'points', 'createdAt', 'updatedAt', '_id'],
  files: ['preview', 'filename', 'length', 'uploadDate', 'taskId', 'metadata', '_id'],
};

export const LIST_COLS: Record<EntityKey, string[]> = {
  groups: ['name', 'status', 'updatedAt'],
  robots: ['name', 'model', 'groupName', 'groupId', 'robotStatus', 'scanRadius', 'weight', 'createdAt', 'updatedAt'],
  tasks: ['name', 'type', 'taskStatus', 'groupName', 'groupId', 'updatedAt'],
  events: ['type', 'message', 'description', 'robotId', 'taskId', 'gridFsFileId', 'timestamp'],
  obstacles: ['name', 'active', 'updatedAt'],
  files: ['preview', 'filename', 'length', 'taskId', 'uploadDate'],
};

export const LIST_LINK_COL: Record<EntityKey, string> = {
  groups: 'name',
  robots: 'name',
  tasks: 'name',
  events: 'type',
  obstacles: 'name',
  files: 'filename',
};

export function listColumnHeader(tab: EntityKey, col: string): string {
  if (tab === 'robots' && col === 'robotStatus') {
    return 'status';
  }
  if (tab === 'robots' && col === 'weight') {
    return 'WEIGHT';
  }
  if (tab === 'robots' && col === 'createdAt') {
    return 'CREATED';
  }
  return col;
}

export const DASH_RECENT_COLS: Record<EntityKey, readonly string[]> = {
  groups: ['name', 'status', 'updatedAt'],
  robots: ['name', 'model', 'groupName', 'robotStatus', 'updatedAt'],
  tasks: ['name', 'type', 'taskStatus', 'updatedAt'],
  events: ['type', 'message', 'timestamp'],
  obstacles: ['name', 'active', 'updatedAt'],
  files: ['filename', 'length', 'uploadDate'],
};

export function emptyFilters(): Record<EntityKey, Record<string, string>> {
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
      start_after: '',
      start_before: '',
      end_after: '',
      end_before: '',
      route: '',
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
      created_after: '',
      created_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
    obstacles: {
      name: '',
      active: '',
      points_q: '',
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
      metadata: '',
      length_min: '',
      length_max: '',
      upload_after: '',
      upload_before: '',
      doc_id: '',
      skip: '0',
      limit: '10',
    },
  };
}

export const REF_TAB: Partial<Record<string, EntityKey>> = {
  groupId: 'groups',
  robotId: 'robots',
  taskId: 'tasks',
  gridFsFileId: 'files',
};

export function refEntityForFieldKey(fieldKey: string): EntityKey | null {
  return REF_TAB[fieldKey] ?? null;
}

export function listHasRefColumns(tab: EntityKey): boolean {
  return LIST_COLS[tab].some((col) => refEntityForFieldKey(col) != null);
}

export type RefNameLookup = {
  groupById: Map<string, string>;
  robotById: Map<string, string>;
  taskById: Map<string, string>;
  fileById: Map<string, string>;
};

export function refDisplayLabelForColumn(columnKey: string, docId: string, lookup: RefNameLookup): string | undefined {
  if (!docId) return undefined;
  if (columnKey === 'groupId') return lookup.groupById.get(docId);
  if (columnKey === 'robotId') return lookup.robotById.get(docId);
  if (columnKey === 'taskId') return lookup.taskById.get(docId);
  if (columnKey === 'gridFsFileId') return lookup.fileById.get(docId);
  return undefined;
}

export type AppTabKey = EntityKey | 'map' | 'home' | 'settings' | 'statistics';

export function isEntityKeyTab(t: AppTabKey): t is EntityKey {
  return t !== 'map' && t !== 'home' && t !== 'settings' && t !== 'statistics';
}

export const TAB_QS = 'tab';
export const DETAIL_QS = 'id';

export const URL_TAB_ORDER: AppTabKey[] = ['home', 'statistics', 'groups', 'robots', 'tasks', 'events', 'obstacles', 'files', 'map', 'settings'];

export function isUrlTab(s: string): s is AppTabKey {
  return (URL_TAB_ORDER as readonly string[]).includes(s);
}

export function readTabFromLocation(): AppTabKey {
  if (typeof window === 'undefined') {
    return 'home';
  }
  const v = new URLSearchParams(window.location.search).get(TAB_QS);
  if (v && isUrlTab(v)) {
    return v;
  }
  return 'home';
}

export function writeTabToLocation(t: AppTabKey) {
  if (typeof window === 'undefined') {
    return;
  }
  const u = new URL(window.location.href);
  u.searchParams.set(TAB_QS, t);
  const s = u.pathname + u.search + u.hash;
  if (s !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, '', s);
  }
}

export function readDetailIdFromLocation(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return (new URLSearchParams(window.location.search).get(DETAIL_QS) || '').trim();
}

export function writeDetailIdToLocation(id: string | null) {
  if (typeof window === 'undefined') {
    return;
  }
  const u = new URL(window.location.href);
  if (id && id.trim()) {
    u.searchParams.set(DETAIL_QS, id.trim());
  } else {
    u.searchParams.delete(DETAIL_QS);
  }
  window.history.replaceState(null, '', u.pathname + u.search + u.hash);
}
