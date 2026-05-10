import React from 'react';
import type { EntityKey } from '../crudModals';
import { refEntityForFieldKey } from '../appConstants';
import { isObjectIdHex } from '../entityUtils';
import { formatTableCell, refId } from '../mongoJson';
import { RefLinkCell } from './RefLinkCell';
import { GridFsAuthImage } from './GridFsAuthImage';
import { GroupRobotsCell } from './GroupRobotsCell';

function plainOidText(value: unknown): string {
  const id = refId(value);
  if (id) return id;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

function isBsonObjectIdWrapper(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '$oid' in (value as object);
}

function isBsonDateWrapper(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '$date' in (value as object);
}

function formatPointSequenceInline(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  if (Array.isArray(first) && first.length === 2) {
    const ok = value.every((x) => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n)));
    if (ok) {
      return (value as number[][]).map((p) => `${p[0]},${p[1]}`).join('; ');
    }
  }
  if (first && typeof first === 'object' && !Array.isArray(first) && 'x' in first && 'y' in first) {
    const ok = value.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const o = item as Record<string, unknown>;
      return Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.y));
    });
    if (ok) {
      return (value as Record<string, unknown>[]).map((o) => `${Number(o.x)},${Number(o.y)}`).join('; ');
    }
  }
  return null;
}

function isPlainXYObject(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  return keys.length === 2 && keys.includes('x') && keys.includes('y') && Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.y));
}

function ExecutionRobotsTable({
  rows,
  goToRef,
}: {
  rows: Record<string, unknown>[];
  goToRef: (target: EntityKey, docId: string) => void;
}) {
  return (
    <div className="overflow-x-auto max-w-full">
      <table className="w-full text-left border-collapse text-[11px] min-w-[260px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
            <th className="py-1.5 pr-2 font-semibold">Robot</th>
            <th className="py-1.5 pr-2 font-semibold">status</th>
            <th className="py-1.5 pr-2 font-semibold">assignedAt</th>
            <th className="py-1.5 font-semibold">removedAt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="py-1.5 pr-2 align-top">
                <RefLinkCell columnKey="robotId" value={row.robotId} goToRef={goToRef} />
              </td>
              <td className="py-1.5 pr-2 align-top text-slate-300">{formatTableCell(row.status, 'status')}</td>
              <td className="py-1.5 pr-2 align-top text-slate-400">{formatTableCell(row.assignedAt, 'assignedAt')}</td>
              <td className="py-1.5 align-top text-slate-400">{formatTableCell(row.removedAt, 'removedAt')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetailFieldValue({
  fieldKey,
  value,
  depth,
  entityTab,
  goToRef,
}: {
  fieldKey: string;
  value: unknown;
  depth: number;
  entityTab: EntityKey;
  goToRef: (target: EntityKey, docId: string) => void;
}): React.ReactNode {
  const maxDepth = 12;
  if (value === null || value === undefined) {
    return <span className="text-slate-500">—</span>;
  }
  if (depth > maxDepth) {
    return <span className="text-slate-500">…</span>;
  }

  if (fieldKey === '_id') {
    const t = plainOidText(value);
    return t ? <span className="font-mono text-xs text-slate-200 break-all">{t}</span> : '—';
  }

  if (entityTab === 'groups' && fieldKey === 'robots') {
    return <GroupRobotsCell value={value} goToRef={goToRef} />;
  }

  const refTarget = refEntityForFieldKey(fieldKey);
  const idStr = refId(value);
  const stringOid = typeof value === 'string' && isObjectIdHex(value.trim());
  if (refTarget && idStr && isObjectIdHex(idStr) && (isBsonObjectIdWrapper(value) || stringOid)) {
    if (fieldKey === 'gridFsFileId' && entityTab === 'events') {
      return (
        <div className="space-y-2">
          <RefLinkCell columnKey={fieldKey} value={value} goToRef={goToRef} />
          <GridFsAuthImage fileId={idStr} />
        </div>
      );
    }
    return <RefLinkCell columnKey={fieldKey} value={value} goToRef={goToRef} />;
  }

  if (isBsonDateWrapper(value)) {
    return <span className="text-slate-300">{formatTableCell(value, fieldKey)}</span>;
  }

  if (isBsonObjectIdWrapper(value) || (typeof value === 'string' && isObjectIdHex(value.trim()))) {
    const t = plainOidText(value);
    return t ? <span className="font-mono text-xs text-slate-200 break-all">{t}</span> : '—';
  }

  if (Array.isArray(value)) {
    if (fieldKey === 'executionRobots' && value.length && value.every((x) => x && typeof x === 'object')) {
      return <ExecutionRobotsTable rows={value as Record<string, unknown>[]} goToRef={goToRef} />;
    }

    const inlinePts = formatPointSequenceInline(value);
    if (inlinePts !== null) {
      return <span className="font-mono text-[11px] text-slate-300 break-all leading-relaxed">{inlinePts}</span>;
    }

    if (value.length === 0) {
      return <span className="text-slate-500">[]</span>;
    }

    const allObjects = value.every((x) => x && typeof x === 'object' && !Array.isArray(x));
    if (allObjects) {
      return (
        <div className="space-y-2">
          {(value as Record<string, unknown>[]).map((item, i) => (
            <div key={i} className="rounded border border-slate-800/60 bg-slate-950/30 px-2 py-1.5 space-y-1">
              <div className="text-[10px] text-slate-600 font-mono tabular-nums">#{i + 1}</div>
              <div className="space-y-1">
                {Object.keys(item)
                  .sort()
                  .map((k) => (
                    <div key={k} className="grid grid-cols-1 sm:grid-cols-[minmax(5rem,9rem)_1fr] gap-x-2 gap-y-0.5">
                      <div className="text-[10px] text-slate-500 font-mono shrink-0">{k}</div>
                      <div className="min-w-0">
                        <DetailFieldValue fieldKey={k} value={item[k]} depth={depth + 1} entityTab={entityTab} goToRef={goToRef} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <ul className="list-disc pl-4 space-y-0.5 text-slate-300 text-[11px]">
        {value.map((item, i) => (
          <li key={i} className="break-words">
            <DetailFieldValue fieldKey={`${fieldKey}[${i}]`} value={item} depth={depth + 1} entityTab={entityTab} goToRef={goToRef} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    if (isPlainXYObject(o)) {
      return (
        <span className="font-mono text-[11px] text-slate-300">
          {Number(o.x)},{Number(o.y)}
        </span>
      );
    }
    return (
      <div className="rounded border border-slate-800/50 bg-slate-950/40 px-2 py-1.5 space-y-1">
        {Object.keys(o)
          .sort()
          .map((k) => (
            <div key={k} className="grid grid-cols-1 sm:grid-cols-[minmax(6rem,10rem)_1fr] gap-x-2 gap-y-0.5 text-left">
              <div className="text-[10px] text-slate-500 font-mono shrink-0 break-all">{k}</div>
              <div className="min-w-0">
                <DetailFieldValue fieldKey={k} value={o[k]} depth={depth + 1} entityTab={entityTab} goToRef={goToRef} />
              </div>
            </div>
          ))}
      </div>
    );
  }

  return <span className="text-slate-300">{formatTableCell(value, fieldKey)}</span>;
}
