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

export function shortHexId(hex: string): string {
  if (hex.length <= 14) {
    return hex;
  }
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

function parseToDate(val: unknown): Date | null {
  if (val == null) {
    return null;
  }
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'object' && val !== null && '$date' in val) {
    const raw = (val as { $date: string | number | { $numberLong: string } }).$date;
    if (typeof raw === 'number') {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof raw === 'string') {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (raw && typeof raw === 'object' && '$numberLong' in raw) {
      const d = new Date(Number((raw as { $numberLong: string }).$numberLong));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

export function formatDateCell(val: unknown): string {
  const d = parseToDate(val);
  if (!d) {
    return '—';
  }
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const ID_COLUMN_KEYS = new Set(['_id', 'groupId', 'robotId', 'taskId', 'gridFsFileId']);
const DATE_KEY_RE = /^(createdAt|updatedAt|timestamp|startTime|endTime|prevTimestamp|assignedAt|removedAt|uploadDate)$/;

export function formatTableCell(value: unknown, columnKey: string): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'object' && value !== null && '$numberLong' in value) {
    return String((value as { $numberLong: string }).$numberLong);
  }

  const isIdCol = ID_COLUMN_KEYS.has(columnKey) || columnKey.endsWith('Id');
  if (typeof value === 'object' && value !== null && '$oid' in value) {
    const id = refId(value);
    return isIdCol ? shortHexId(id) : id;
  }

  if (DATE_KEY_RE.test(columnKey)) {
    return formatDateCell(value);
  }

  if (typeof value === 'object' && value !== null && '$date' in value) {
    return formatDateCell(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }

  if (columnKey === 'points' && Array.isArray(value)) {
    const s = JSON.stringify(value);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }

  const s = JSON.stringify(value);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

export function cellText(val: unknown, max = 120): string {
  if (val === null || val === undefined) {
    return '—';
  }
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  const s = JSON.stringify(val);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function dateToInput(val: unknown): string {
  if (val == null) {
    return '';
  }
  let d: Date | null = null;
  if (typeof val === 'string') {
    d = new Date(val);
  } else if (typeof val === 'object' && val !== null && '$date' in val) {
    const raw = (val as { $date: string | number | { $numberLong: string } }).$date;
    if (typeof raw === 'number') {
      d = new Date(raw);
    } else if (typeof raw === 'string') {
      d = new Date(raw);
    } else if (raw && typeof raw === 'object' && '$numberLong' in raw) {
      d = new Date(Number((raw as { $numberLong: string }).$numberLong));
    }
  }
  if (!d || Number.isNaN(d.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(s: string): string | undefined {
  const t = s.trim();
  if (!t) {
    return undefined;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    return undefined;
  }
  return d.toISOString();
}
