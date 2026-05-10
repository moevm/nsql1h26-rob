import React from 'react';
import type { EntityKey } from '../crudModals';
import { refEntityForFieldKey } from '../appConstants';
import { isObjectIdHex } from '../entityUtils';
import { formatTableCell, refId, shortHexId } from '../mongoJson';

export const refLinkUnderlineClass =
  'font-mono text-[11px] text-[#7ab8ff] underline underline-offset-2 decoration-[#7ab8ff]/85 hover:text-[#9ecfff] hover:decoration-[#9ecfff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#137fec]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 rounded-sm cursor-pointer';

export function RefLinkCell({
  columnKey,
  value,
  goToRef,
}: {
  columnKey: string;
  value: unknown;
  goToRef: (target: EntityKey, docId: string) => void;
}) {
  const target = refEntityForFieldKey(columnKey);
  const id = refId(value);
  if (!target || !id || !isObjectIdHex(id)) {
    return <span className="text-slate-300">{formatTableCell(value, columnKey)}</span>;
  }
  const label = shortHexId(id);
  return (
    <button type="button" className={`text-left align-baseline ${refLinkUnderlineClass}`} onClick={() => goToRef(target, id)}>
      {label}
    </button>
  );
}
