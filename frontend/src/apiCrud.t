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
    return t || res.statusText;
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
  const res = await fetch(url, { headers: { ...authHeaders() } });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<unknown[]>;
}

export async function apiGetOne(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    throw new Error(await errText(res));
  }
  return res.json() as Promise<Record<string, unknown>>;
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
