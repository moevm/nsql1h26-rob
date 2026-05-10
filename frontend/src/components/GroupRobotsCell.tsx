import React from 'react';
import type { EntityKey } from '../crudModals';
import { isObjectIdHex } from '../entityUtils';
import { bsonId, formatTableCell, shortHexId } from '../mongoJson';
import { refLinkUnderlineClass } from './RefLinkCell';

export function GroupRobotsCell({
  value,
  goToRef,
}: {
  value: unknown;
  goToRef: (target: EntityKey, docId: string) => void;
}) {
  if (!Array.isArray(value) || value.length === 0) {
    return <span className="text-slate-500">—</span>;
  }
  const items = value.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[];
  const sorted = [...items].sort((a, b) => {
    const na = String(a.name ?? '').trim();
    const nb = String(b.name ?? '').trim();
    const cmp = na.localeCompare(nb, undefined, { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    const ia = bsonId(a) ?? '';
    const ib = bsonId(b) ?? '';
    return ia.localeCompare(ib);
  });

  return (
    <ul className="list-none m-0 p-0 space-y-1">
      {sorted.map((r, idx) => {
        const id = bsonId(r);
        const name = formatTableCell(r.name, 'name');
        const valid = id && isObjectIdHex(id);
        return (
          <li key={id || `r-${idx}`} className="text-left leading-snug">
            {valid ? (
              <span className="inline-flex flex-wrap items-baseline gap-x-1">
                <span className="text-slate-300">{name}</span>
                <button type="button" className={`${refLinkUnderlineClass} shrink-0`} onClick={() => goToRef('robots', id)}>
                  {shortHexId(id)}
                </button>
              </span>
            ) : (
              <span className="text-slate-500 text-xs">{name || '—'}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
