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
