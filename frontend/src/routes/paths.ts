import type { EntityKey } from '../crudModals';
import type { AppTabKey } from '../appConstants';

export const ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  statistics: '/statistics',
  map: '/map',
  settings: '/settings',
  entityList: (e: EntityKey) => `/${e}`,
  entityDetail: (e: EntityKey, id: string) => `/${e}/${encodeURIComponent(id)}`,
} as const;

export function tabKeyFromPath(pathname: string): AppTabKey {
  const segs = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const a = segs[0] ?? '';
  if (a === 'dashboard' || a === '') return 'home';
  if (a === 'statistics') return 'statistics';
  if (a === 'map') return 'map';
  if (a === 'settings') return 'settings';
  const entities: EntityKey[] = ['groups', 'robots', 'tasks', 'events', 'obstacles', 'files'];
  if (entities.includes(a as EntityKey)) return a as EntityKey;
  return 'home';
}

export function parseEntityRoute(pathname: string): {
  entity: EntityKey | null;
  detailId: string | null;
} {
  const segs = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const a = segs[0] ?? '';
  const entities: EntityKey[] = ['groups', 'robots', 'tasks', 'events', 'obstacles', 'files'];
  if (!entities.includes(a as EntityKey)) return { entity: null, detailId: null };
  const id = segs[1]?.trim() ?? '';
  return { entity: a as EntityKey, detailId: id || null };
}

const ENTITY_KEYS_LIST: EntityKey[] = ['groups', 'robots', 'tasks', 'events', 'obstacles', 'files'];

export function isEntityPathKey(s: string | undefined): s is EntityKey {
  return Boolean(s && ENTITY_KEYS_LIST.includes(s as EntityKey));
}

export function navigateForTab(navigate: (to: string) => void, t: AppTabKey) {
  if (t === 'home') navigate(ROUTES.dashboard);
  else if (t === 'statistics') navigate(ROUTES.statistics);
  else if (t === 'map') navigate(ROUTES.map);
  else if (t === 'settings') navigate(ROUTES.settings);
  else navigate(ROUTES.entityList(t));
}
