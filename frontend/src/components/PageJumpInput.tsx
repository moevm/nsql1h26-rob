import React, { useEffect, useState } from 'react';
import { sanitizeNonNegIntTyping } from '../coordinateInput';

export function PageJumpInput({
  pageIndex,
  onCommit,
  className,
}: {
  pageIndex: number;
  onCommit: (zeroBasedIndex: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => String(pageIndex + 1));

  useEffect(() => {
    setDraft(String(pageIndex + 1));
  }, [pageIndex]);

  function commit() {
    const cleaned = sanitizeNonNegIntTyping(draft);
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n < 1) {
      setDraft(String(pageIndex + 1));
      return;
    }
    onCommit(n - 1);
    setDraft(String(n));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      aria-label="Page number"
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
