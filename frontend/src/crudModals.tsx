import React, { useEffect, useState } from 'react';
import { apiPatch, apiPost } from './apiCrud';
import { bsonId, dateToInput, localInputToIso, refId } from './mongoJson';

export type EntityKey = 'groups' | 'robots' | 'tasks' | 'events' | 'obstacles' | 'files';

export const GROUP_STATUS = ['active', 'inactive', 'paused', 'error'] as const;
export const TASK_TYPES = ['moveToTarget', 'patrol', 'scanRadius', 'custom'] as const;
export const TASK_STATUS = ['active', 'paused', 'completed', 'cancelled', 'failed'] as const;

export const inp = 'bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 w-full focus:border-blue-500 outline-none transition-colors';
export const lbl = 'text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1';

export function dateInp(value: string): string {
  return `${inp} ${value.trim() ? '' : 'text-slate-500'}`;
}

export function CrudModal({
  entity,
  doc,
  onClose,
  onSave,
}: {
  entity: EntityKey;
  doc?: Record<string, any> | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [title, setTitle] = useState(doc?.title || '');
  const [status, setStatus] = useState(doc?.status || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        {/* Шапка модалки */}
        <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            {doc ? `Edit ${entity}` : `New ${entity}`}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            ✕
          </button>
        </div>

        {/* Тело модалки */}
        <div className="p-4 overflow-y-auto custom-scrollbar space-y-3">
          {err && (
            <div className="text-[10px] bg-red-950/50 text-red-400 p-2 rounded border border-red-900/50">
              {err}
            </div>
          )}
          
          <label>
            <span className={lbl}>Title / Name</span>
            <input 
              className={inp} 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="Enter name..."
            />
          </label>
        </div>

        {/* Футер с кнопками добавим в следующем коммите */}
      </div>
    </div>
  );
}
