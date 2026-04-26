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
