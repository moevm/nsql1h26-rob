import React, { useEffect, useState } from 'react';
import { sanitizeNonNegIntTyping } from '../coordinateInput';

const MIN = 1;
const MAX = 100;

export function PageSizeInput({
  pageSize,
  onCommit,
  className,
}: {
  pageSize: number;
  onCommit: (size: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => String(pageSize));

  useEffect(() => {
    setDraft(String(pageSize));
  }, [pageSize]);

  function commit() {
    const cleaned = sanitizeNonNegIntTyping(draft);
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n < MIN) {
      setDraft(String(pageSize));
      return;
    }
    const safe = Math.min(Math.max(n, MIN), MAX);
    onCommit(safe);
    setDraft(String(safe));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      aria-label="Rows per page"
      className={className}
      value={draft}
      onChange={(e) => setDraft(sanitizeNonNegIntTyping(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
