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
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    u.set(k, String(v));
  }
  return u.toString();
}
