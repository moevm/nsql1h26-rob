import React from 'react';

export function MapRecordTitleNav({
  title,
  disabledReason,
  onOpen,
}: {
  title: string;
  disabledReason?: string;
  onOpen: () => void;
}) {
  if (disabledReason) {
    return (
      <div>
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <p className="text-[10px] text-slate-500 mt-0.5">{disabledReason}</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <button
        type="button"
        className="group text-left max-w-full rounded-md px-2 -mx-2 py-1.5 border border-dashed border-slate-600/90 hover:border-[#137fec]/55 hover:bg-[#137fec]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#137fec]/50"
        title="Opens the full entity page (does not change map selection)"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        <span className="text-sm font-semibold text-[#7ab8ff] group-hover:text-[#9ecfff] underline underline-offset-[3px] decoration-[#7ab8ff]/80 group-hover:decoration-[#9ecfff]">
          {title}
        </span>
      </button>
    </div>
  );
}
