export function bsonId(doc: Record<string, unknown>): string {
  const id = doc._id;
  if (typeof id === 'string') {
    return id;
  }
  if (id && typeof id === 'object' && id !== null && '$oid' in id) {
    return String((id as { $oid: string }).$oid);
  }
  return '';
}

export function refId(val: unknown): string {
  if (val == null) {
    return '';
  }
  if (typeof val === 'string') {
    return val;
  }
  if (typeof val === 'object' && val !== null && '$oid' in val) {
    return String((val as { $oid: string }).$oid);
  }
  return '';
}

export function dateToInput(val: unknown): string {
  if (val == null) return '';
  let d: Date | null = null;
  
  if (typeof val === 'string') {
    d = new Date(val);
  } else if (typeof val === 'object' && val !== null && '$date' in val) {
    const raw = (val as any).$date;
    d = new Date(typeof raw === 'number' ? raw : raw?.$numberLong ? Number(raw.$numberLong) : raw);
  }

  if (!d || isNaN(d.getTime())) return '';
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(val: string): string | null {
  if (!val.trim()) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function shortHexId(hex: string): string {
  if (hex.length <= 14) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

export function cellText(val: unknown, max = 120): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  const s = JSON.stringify(val);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function formatTableCell(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') {
    if ('$date' in val || '$oid' in val) {
       // Для спец-объектов Mongo лучше выводить строку или ID
       return cellText(val); 
    }
    return JSON.stringify(val);
  }
  return String(val);
}
