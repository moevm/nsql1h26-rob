const BASE = '';

const TOKEN_KEY = 'auth_token';

export function setAuthToken(token: string | null) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function errText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    if (!t) {
      return res.statusText;
    }
    try {
      const j = JSON.parse(t) as { detail?: unknown };
      if (j.detail != null) {
        if (typeof j.detail === 'string') {
          return j.detail;
        }
        if (Array.isArray(j.detail)) {
          return j.detail
            .map((item: unknown) =>
              item && typeof item === 'object' && item !== null && 'msg' in item
                ? String((item as { msg: string }).msg)
                : JSON.stringify(item),
            )
            .join(' ');
        }
      }
    } catch {}
    return t;
  } catch {
    return res.statusText;
  }
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) {
      continue;
    }
    if (typeof v === 'string' && v.trim() === '') {
      continue;
    }
    u.set(k, String(v));
  }
  return u.toString();
}

export async function apiList(path: string, params: Record<string, string | number | boolean | undefined | null>): Promise<unknown[]> {
  const q = buildQuery(params);
  const url = q ? `${BASE}${path}?${q}` : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { ...authHeaders() },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<unknown[]>;
}

export async function apiGetOne(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...authHeaders() },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function apiGetJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...authHeaders() },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json();
}

export async function apiPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function apiPatch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
}

const ROLE_KEY = 'auth_role';
const USERNAME_KEY = 'auth_username';

export function setAuthUsername(name: string | null) {
  try {
    if (!name) {
      localStorage.removeItem(USERNAME_KEY);
    } else {
      localStorage.setItem(USERNAME_KEY, name);
    }
  } catch {}
}

export function getAuthUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

export function setAuthRole(role: string | null) {
  try {
    if (!role) {
      localStorage.removeItem(ROLE_KEY);
    } else {
      localStorage.setItem(ROLE_KEY, role);
    }
  } catch {}
}

export function getAuthRole(): string | null {
  try {
    return localStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
}

export async function apiAppExport(): Promise<unknown> {
  const res = await fetch(`${BASE}/api/app/export`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<unknown>;
}

export async function apiAppImport(body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/api/app/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<unknown>;
}
