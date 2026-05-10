import React, { useId } from 'react';
import { sanitizeObjectIdFilterTyping } from '../coordinateInput';

export function OidSuggestInput({
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  options: readonly { id: string; label?: string; name?: string }[];
  className: string;
  placeholder?: string;
}) {
  const reactId = useId().replace(/:/g, '');
  const listId = `oid-dl-${reactId}`;

  return (
    <>
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        className={className}
        value={value}
        placeholder={placeholder}
        list={listId}
        onChange={(e) => onChange(sanitizeObjectIdFilterTyping(e.target.value))}
      />
      <datalist id={listId}>
        {options
          .filter((o) => Boolean(o.id))
          .map((o) => {
            const lbl = (o.label ?? o.name ?? '').trim();
            const suffix = o.id.slice(-6);
            const hint = lbl ? `${lbl} (${suffix})` : suffix;
            return <option key={o.id} value={o.id} label={hint} />;
          })}
      </datalist>
    </>
  );
}
