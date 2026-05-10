export function sanitizeNonNegIntTyping(s: string): string {
  return s.replace(/\D/g, '');
}

export function sanitizeSignedIntTyping(s: string): string {
  const stripped = s.replace(/[^\d-]/g, '');
  if (!stripped) return '';
  let sign = '';
  let rest = stripped;
  if (rest[0] === '-') {
    sign = '-';
    rest = rest.slice(1);
  }
  rest = rest.replace(/-/g, '').replace(/\D/g, '');
  return sign + rest;
}

export function sanitizeDecimalTyping(s: string): string {
  const t = s.replace(/[^\d.]/g, '');
  const i = t.indexOf('.');
  if (i === -1) return t;
  return t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '');
}

export function sanitizeBracketPointsTyping(s: string): string {
  return s.replace(/[^\d\s,[\]\-\.;\n\r\t]/g, '');
}

export function sanitizeRouteFilterTyping(s: string): string {
  return s.replace(/[^\d\s,;\-\n\r\t]/g, '');
}

export function sanitizeObjectIdFilterTyping(s: string): string {
  const t = s.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return t.length <= 24 ? t : t.slice(0, 24);
}
