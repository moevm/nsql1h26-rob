import { createContext, useContext } from 'react';

export type MissionApi = Record<string, unknown>;

export const MissionContext = createContext<MissionApi | null>(null);

export function useMission(): MissionApi {
  const v = useContext(MissionContext);
  if (!v) {
    throw new Error('useMission: MissionContext missing');
  }
  return v;
}
