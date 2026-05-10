import React, { useState } from 'react';
import { MapAxesOverlay } from '../components/MapAxesOverlay';
import { MapRecordTitleNav } from '../components/MapRecordTitleNav';
import { MapRobotNavIcon } from '../components/MapRobotNavIcon';
import { FILTER_LBL, TASK_TYPES } from '../appConstants';
import { parseTaskSpatial, robotCoordinatesFromDoc } from '../entityUtils';
import {
  MAP_AXIS_PAD_LEFT,
  MAP_CELL,
  MAP_COLS,
  MAP_CONTENT_HEIGHT,
  MAP_CONTENT_WIDTH,
  MAP_H,
  MAP_ROWS,
  MAP_W,
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  type MapPickLayer,
} from '../mapConstants';
import { bsonId, refId, shortHexId } from '../mongoJson';
import { ROUTES } from '../routes/paths';
import { useMission } from '../mission/missionContext';

type TaskType = (typeof TASK_TYPES)[number];

function robotIsOffline(r: Record<string, unknown>): boolean {
  return String(r.robotStatus ?? 'online').toLowerCase() === 'offline';
}

function pickLayerPointerEvents(layer: MapPickLayer, target: 'robots' | 'tasks' | 'obstacles'): 'auto' | 'none' {
  return layer === 'all' || layer === target ? 'auto' : 'none';
}

type MapSidebarTab = 'groups' | 'robots' | 'tasks';

export function MapPage() {
  const m = useMission();
  const [mapSidebarTab, setMapSidebarTab] = useState<MapSidebarTab>('robots');
  const {
    mapSearch,
    setMapSearch,
    mapView,
    mapCreateOpen,
    setMapCreateOpen,
    mapTool,
    setMapTool,
    mapDraftPts,
    setMapDraftPts,
    mapPlannedPts,
    setMapPlannedPts,
    openTaskFromDraft,
    openObstacleFromDraft,
    mapGroups,
    mapSelectedGroupId,
    setMapSelectedGroupId,
    mapSelectedRobotId,
    setMapSelectedRobotId,
    addTaskPointFromMouse,
    addPointFromMouse,
    mapDragging,
    setMapDragging,
    mapOffset,
    setMapOffset,
    mapZoom,
    setMapZoom,
    mapDragStart,
    setMapDragStart,
    mapGridRef,
    coordFromOid,
    mapObstaclesView,
    mapTasksView,
    mapTasks,
    mapObstacles,
    mapSelectedObstacleId,
    setMapSelectedObstacleId,
    mapSelectedTaskId,
    setMapSelectedTaskId,
    navigate,
    bump,
    mapPickerResume,
    mapObstaclePickerResume,
    clearMapPickerResume,
    mapPickLayer,
    setMapPickLayer,
  } = m as Record<string, unknown>;

  const layer = ((mapPickLayer as MapPickLayer | undefined) ?? 'all') as MapPickLayer;
  const pe = {
    robots: pickLayerPointerEvents(layer, 'robots'),
    tasks: pickLayerPointerEvents(layer, 'tasks'),
    obstacles: pickLayerPointerEvents(layer, 'obstacles'),
  };
  const allowPick = {
    robots: layer === 'all' || layer === 'robots',
    tasks: layer === 'all' || layer === 'tasks',
    obstacles: layer === 'all' || layer === 'obstacles',
  };

  const hasTaskMapPickerResume = Boolean(mapPickerResume);
  const hasObstacleMapPickerResume = Boolean(mapObstaclePickerResume);

  return (
    <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
    <div className="flex h-[78vh] min-h-[640px]">
      <aside className="w-80 border-r border-slate-800 bg-[#101922] p-4 space-y-3 overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-200">Map</h2>
        </div>
        <input
          className="bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
          value={mapSearch}
          onChange={(e) => setMapSearch(e.target.value)}
          placeholder="Search robots, tasks (names & route coords), obstacles…"
        />
        <div className="text-[11px] text-slate-500">
          Showing{' '}
          <span className="text-slate-200">
            {mapSidebarTab === 'robots'
              ? mapView.filtered.length
              : mapSidebarTab === 'groups'
                ? mapGroups.length
                : mapTasksView.length}
          </span>
          {mapSidebarTab === 'robots' ? ' robots' : mapSidebarTab === 'groups' ? ' groups' : ' tasks'}
        </div>

        <div className="flex rounded-lg border border-slate-800 p-0.5 bg-slate-950/80 gap-0.5" role="tablist" aria-label="Map sidebar">
          {(
            [
              { id: 'groups' as const, label: 'Groups' },
              { id: 'robots' as const, label: 'Robots' },
              { id: 'tasks' as const, label: 'Tasks' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mapSidebarTab === id}
              className={`flex-1 text-[11px] font-medium px-2 py-1.5 rounded-md transition-colors ${
                mapSidebarTab === id
                  ? 'bg-[#137fec]/20 text-slate-100 border border-[#137fec]/35'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              onClick={() => setMapSidebarTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <button
              type="button"
              aria-expanded={mapCreateOpen}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                mapCreateOpen
                  ? 'bg-[#137fec]/10 border-[#137fec]/35 text-slate-100'
                  : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700 hover:bg-slate-900/70'
              }`}
              onClick={() => setMapCreateOpen((v) => !v)}
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Create on map</span>
                <span className="text-[11px] text-slate-500">click to {mapCreateOpen ? 'collapse' : 'expand'}</span>
              </span>
              <span className={`text-slate-300 transition-transform ${mapCreateOpen ? 'rotate-180' : 'rotate-0'}`} aria-hidden="true">
                ▾
              </span>
            </button>

            {mapCreateOpen && (
              <div className="grid grid-cols-1 gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`text-xs px-3 py-2 rounded border ${
                      mapTool?.kind === 'task' ? 'bg-[#137fec]/10 border-[#137fec]/40 text-slate-100' : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700'
                    }`}
                    onClick={() => {
                      (clearMapPickerResume as (() => void) | undefined)?.();
                      setMapTool({ kind: 'task', taskType: 'moveToTarget', plannedRoute: false, step: 'main', radius: 8 });
                      setMapDraftPts([]);
                      setMapPlannedPts([]);
                    }}
                  >
                    Task
                  </button>
                  <button
                    type="button"
                    className={`text-xs px-3 py-2 rounded border ${
                      mapTool?.kind === 'obstacle' ? 'bg-[#137fec]/10 border-[#137fec]/40 text-slate-100' : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700'
                    }`}
                    onClick={() => {
                      (clearMapPickerResume as (() => void) | undefined)?.();
                      setMapTool({ kind: 'obstacle' });
                      setMapDraftPts([]);
                      setMapPlannedPts([]);
                    }}
                  >
                    Obstacle
                  </button>
                </div>

                {mapTool?.kind === 'task' && (
                  <div className="grid grid-cols-1 gap-2">
                    <label>
                      <span className={FILTER_LBL}>type</span>
                      <select
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
                        value={mapTool.taskType}
                        onChange={(e) => {
                          const next = e.target.value as TaskType;
                          setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, taskType: next, step: 'main' } : cur));
                          setMapDraftPts([]);
                          setMapPlannedPts([]);
                        }}
                      >
                        {TASK_TYPES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={mapTool.plannedRoute}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, plannedRoute: next, step: 'main' } : cur));
                          if (!next) setMapPlannedPts([]);
                        }}
                      />
                      Add planned route
                    </label>

                    {mapTool.taskType === 'scanRadius' && (
                      <label>
                        <span className={FILTER_LBL}>radius</span>
                        <input
                          type="range"
                          min={1}
                          max={50}
                          value={mapTool.radius}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, radius: Number.isFinite(n) ? n : cur.radius } : cur));
                          }}
                          className="w-full"
                        />
                        <div className="text-[11px] text-slate-500">r = {Math.floor(mapTool.radius)}</div>
                      </label>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-900"
                        onClick={() => {
                          if (mapTool.step === 'planned') setMapPlannedPts([]);
                          else setMapDraftPts([]);
                        }}
                      >
                        Clear
                      </button>
                      {mapTool.plannedRoute && (
                        <button
                          type="button"
                          className="flex-1 text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-900"
                          onClick={() => setMapTool((cur) => (cur && cur.kind === 'task' ? { ...cur, step: cur.step === 'main' ? 'planned' : 'main' } : cur))}
                        >
                          {mapTool.step === 'main' ? 'Planned…' : 'Main…'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex-1 text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-50"
                        disabled={
                          mapTool.taskType === 'moveToTarget'
                            ? mapDraftPts.length !== 1
                            : mapTool.taskType === 'scanRadius'
                              ? mapDraftPts.length !== 1
                              : mapTool.taskType === 'patrol'
                                ? mapDraftPts.length < 2
                                : false
                        }
                        onClick={() => {
                          openTaskFromDraft();
                        }}
                      >
                        {hasTaskMapPickerResume ? 'Continue in form…' : 'Open form'}
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-500">
                      {mapTool.step === 'planned'
                        ? `Planned route points: ${mapPlannedPts.length} (need 2+)`
                        : mapTool.taskType === 'patrol'
                          ? `Route points: ${mapDraftPts.length} (need 2+)`
                          : mapTool.taskType === 'custom'
                            ? `Optional point clicks`
                            : `Point: ${mapDraftPts.length} (need 1)`}
                    </div>
                  </div>
                )}

                {mapTool?.kind === 'obstacle' && (
                  <div className="grid grid-cols-1 gap-2">
                    <div className="text-xs text-slate-300">Click vertices on the map.</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-900"
                        onClick={() => setMapDraftPts([])}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="flex-1 text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-50"
                        disabled={mapDraftPts.length < 3}
                        onClick={() => {
                          openObstacleFromDraft();
                        }}
                      >
                        {hasObstacleMapPickerResume ? 'Continue in form…' : 'Open form'}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500">{`Obstacle draft points: ${mapDraftPts.length} (need 3+)`}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          {mapSidebarTab === 'groups' && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Groups</div>
                {mapSelectedGroupId && (
                  <button
                    type="button"
                    className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
                    onClick={() => {
                      setMapSelectedGroupId(null);
                      setMapSelectedTaskId(null);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {mapGroups.length ? (
                  mapGroups.map((g) => {
                    const active = g.id === mapSelectedGroupId;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setMapSelectedGroupId((prev) => (prev === g.id ? null : g.id));
                          setMapSelectedRobotId(null);
                          setMapSelectedObstacleId(null);
                          setMapSelectedTaskId(null);
                        }}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                          active ? 'bg-[#137fec]/10 border-[#137fec]/40' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs text-slate-200 font-medium">{g.name || '—'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {shortHexId(g.id)} · {g.count} robot(s)
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-[11px] text-slate-600">—</div>
                )}
              </div>
            </div>
          )}
          {mapSidebarTab === 'robots' && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Robots</div>
              <div className="space-y-2">
                {mapView.filtered.map((r) => {
                  const id = bsonId(r);
                  const active = id && id === mapSelectedRobotId;
                  const inGroup = mapSelectedGroupId ? refId((r as Record<string, unknown>).groupId) === mapSelectedGroupId : false;
                  return (
                    <button
                      key={id || JSON.stringify(r)}
                      type="button"
                      onClick={() => {
                        setMapSelectedRobotId(id || null);
                        setMapSelectedObstacleId(null);
                        setMapSelectedTaskId(null);
                      }}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        active
                          ? 'bg-[#137fec]/10 border-[#137fec]/40'
                          : inGroup
                            ? 'bg-[#137fec]/5 border-[#137fec]/25'
                            : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs text-slate-200 font-medium">{String(r.name ?? '—')}</div>
                      <div className="text-[10px] text-slate-500">
                        {robotIsOffline(r as Record<string, unknown>) ? (
                          <span className="text-amber-400/90 font-medium">offline · </span>
                        ) : null}
                        {String(r.groupName ?? '—')} · {shortHexId(id || '')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {mapSidebarTab === 'tasks' && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Tasks</div>
                {mapSelectedTaskId && (
                  <button
                    type="button"
                    className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
                    onClick={() => {
                      setMapSelectedTaskId(null);
                      setMapSelectedGroupId(null);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {mapTasksView.length ? (
                  mapTasksView.map((t) => {
                    const tid = bsonId(t);
                    if (!tid) return null;
                    const tr = t as Record<string, unknown>;
                    const gid = refId(tr.groupId).trim();
                    const active = tid === mapSelectedTaskId;
                    const st = String(tr.taskStatus ?? '');
                    const strokeHint =
                      st === 'active'
                        ? 'text-emerald-400/90'
                        : st === 'paused'
                          ? 'text-amber-300/90'
                          : st === 'completed'
                            ? 'text-slate-400'
                            : 'text-sky-400/90';
                    return (
                      <button
                        key={tid}
                        type="button"
                        onClick={() => {
                          setMapSelectedTaskId(tid);
                          setMapSelectedGroupId(gid || null);
                          setMapSelectedRobotId(null);
                          setMapSelectedObstacleId(null);
                        }}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                          active ? 'bg-[#137fec]/10 border-[#137fec]/40' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs text-slate-200 font-medium">{String(tr.name ?? '—')}</div>
                        <div className={`text-[10px] font-medium ${strokeHint}`}>
                          {String(tr.type ?? '—')} · {st || '—'}
                        </div>
                        <div className="text-[10px] text-slate-500">{String(tr.groupName ?? '—')} · {shortHexId(tid)}</div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-[11px] text-slate-600">—</div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      <div
        className={`flex-1 bg-slate-950 relative overflow-hidden ${mapDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={(e) => {
          if (mapTool) {
            const el = e.target as Element | null;
            if (el && el.closest('[data-map-interactive="true"]')) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (mapTool.kind === 'task') {
              addTaskPointFromMouse(e.clientX, e.clientY);
            } else {
              addPointFromMouse(e.clientX, e.clientY);
            }
            return;
          }
          setMapDragging(true);
          setMapDragStart({ x: e.clientX - mapOffset.x * mapZoom, y: e.clientY - mapOffset.y * mapZoom });
        }}
        onMouseMove={(e) => {
          if (!mapDragging) return;
          setMapOffset({ x: (e.clientX - mapDragStart.x) / mapZoom, y: (e.clientY - mapDragStart.y) / mapZoom });
        }}
        onMouseUp={() => setMapDragging(false)}
        onMouseLeave={() => setMapDragging(false)}
        onWheel={(e) => {
          e.preventDefault();
          const dir = e.deltaY > 0 ? -1 : 1;
          const next = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, mapZoom + dir * 0.1));
          setMapZoom(next);
        }}
      >
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <button
            type="button"
            className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => setMapZoom((z) => Math.min(MAP_ZOOM_MAX, z + 0.2))}
          >
            Zoom +
          </button>
          <button
            type="button"
            className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => setMapZoom((z) => Math.max(MAP_ZOOM_MIN, z - 0.2))}
          >
            Zoom -
          </button>
          <button
            type="button"
            className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => {
              setMapZoom(1);
              setMapOffset({ x: 0, y: 0 });
            }}
          >
            Reset ({Math.round(mapZoom * 100)}%)
          </button>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/80 backdrop-blur px-2 py-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide whitespace-nowrap">Pick</span>
            {(
              [
                ['all', 'All'] as const,
                ['robots', 'Robots'] as const,
                ['tasks', 'Tasks'] as const,
                ['obstacles', 'Obst.'] as const,
              ]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                title={
                  key === 'all'
                    ? 'Obstacles sit above task graphics; robot markers stay on top when overlapping'
                    : `Only ${label} react to clicks on the map`
                }
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  layer === key
                    ? 'border-[#137fec]/70 bg-[#137fec]/20 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                onClick={() => (setMapPickLayer as (v: MapPickLayer) => void)(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {mapSelectedRobotId && (
            <button
              type="button"
              className="bg-[#137fec] px-3 py-1.5 rounded-lg border border-[#137fec]/50 text-xs text-white font-medium hover:bg-[#137fec]/80"
              onClick={() => {
                const selected = mapView.selected;
                const id = mapSelectedRobotId;
                const parsed = selected ? robotCoordinatesFromDoc(selected as Record<string, unknown>) : null;
                const xy = parsed ?? coordFromOid(id);
                const x = Number.isFinite(xy.x) ? Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xy.x))) : 0;
                const y = Number.isFinite(xy.y) ? Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(xy.y))) : 0;
                setMapOffset({
                  x: Math.floor((MAP_W / 2 - (x * MAP_CELL + MAP_CELL / 2)) / mapZoom),
                  y: Math.floor((MAP_H / 2 - (y * MAP_CELL + MAP_CELL / 2)) / mapZoom),
                });
              }}
            >
              Center
            </button>
          )}
        </div>

        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `scale(${mapZoom}) translate(${mapOffset.x}px, ${mapOffset.y}px)`,
            transformOrigin: '0 0',
            transition: mapDragging ? 'none' : 'transform 120ms ease-out',
          }}
        >
          <div
            className="relative shrink-0"
            style={{
              width: MAP_CONTENT_WIDTH,
              height: MAP_CONTENT_HEIGHT,
            }}
          >
            <div
              ref={mapGridRef}
              className="absolute top-0 overflow-visible z-0"
              style={{
                left: MAP_AXIS_PAD_LEFT,
                width: MAP_W,
                height: MAP_H,
              }}
            >
            <div
              className="absolute inset-0 grid pointer-events-none"
              style={{
                gridTemplateColumns: `repeat(${MAP_COLS}, ${MAP_CELL}px)`,
                gridTemplateRows: `repeat(${MAP_ROWS}, ${MAP_CELL}px)`,
              }}
            >
              {Array.from({ length: MAP_COLS * MAP_ROWS }).map((_, i) => (
                <div key={i} className="border border-slate-800/40" />
              ))}
            </div>

            <svg className="absolute inset-0" width={MAP_W} height={MAP_H} style={{ pointerEvents: pe.tasks }}>
              {mapTasksView.map((t) => {
                const tid = bsonId(t);
                if (!tid) return null;
                const { main, planned, scan } = parseTaskSpatial(t);
                const sel = tid === mapSelectedTaskId;
                const sw = sel ? 4 : 2;
                const st = String(t.taskStatus ?? '');
                const strokeMain =
                  st === 'active'
                    ? 'rgba(34,197,94,0.9)'
                    : st === 'paused'
                      ? 'rgba(234,179,8,0.95)'
                      : st === 'completed'
                        ? 'rgba(148,163,184,0.8)'
                        : 'rgba(56,189,248,0.9)';
                const fillMain =
                  st === 'active'
                    ? 'rgba(34,197,94,0.22)'
                    : st === 'paused'
                      ? 'rgba(234,179,8,0.22)'
                      : st === 'completed'
                        ? 'rgba(148,163,184,0.14)'
                        : 'rgba(56,189,248,0.22)';
                const nodes: React.ReactNode[] = [];
                const taskPE =
                  pe.tasks === 'none'
                    ? ('none' as const)
                    : ('visiblePainted' as const);
                const strokePE =
                  pe.tasks === 'none'
                    ? ('none' as const)
                    : ('visibleStroke' as const);
                if (main.length === 1) {
                  const p = main[0];
                  nodes.push(
                    <circle
                      key={`m1_${tid}`}
                      cx={p.x * MAP_CELL + MAP_CELL / 2}
                      cy={p.y * MAP_CELL + MAP_CELL / 2}
                      r={sel ? 11 : 9}
                      fill={fillMain}
                      stroke={strokeMain}
                      strokeWidth={sw}
                      pointerEvents={taskPE}
                    />,
                  );
                }
                if (main.length >= 2) {
                  nodes.push(
                    <polyline
                      key={`m_${tid}`}
                      fill="none"
                      stroke={strokeMain}
                      strokeWidth={sw}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents={strokePE}
                      points={main.map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                    />,
                  );
                }
                if (planned.length >= 2) {
                  nodes.push(
                    <polyline
                      key={`p_${tid}`}
                      fill="none"
                      stroke="rgba(168,85,247,0.92)"
                      strokeWidth={sel ? 3 : 2}
                      strokeDasharray="6 4"
                      pointerEvents={strokePE}
                      points={planned.map(([x, y]) => `${x * MAP_CELL + MAP_CELL / 2},${y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                    />,
                  );
                }
                if (scan) {
                  nodes.push(
                    <circle
                      key={`sc_${tid}`}
                      cx={scan.cx * MAP_CELL + MAP_CELL / 2}
                      cy={scan.cy * MAP_CELL + MAP_CELL / 2}
                      r={scan.r * MAP_CELL}
                      fill="rgba(234,179,8,0.06)"
                      stroke="rgba(234,179,8,0.85)"
                      strokeWidth={sel ? 2 : 1}
                      pointerEvents={taskPE}
                    />,
                  );
                }
                if (!nodes.length) return null;
                const taskRec = t as Record<string, unknown>;
                const taskGroupId = refId(taskRec.groupId).trim();
                return (
                  <g
                    key={`task_layer_${tid}`}
                    data-map-interactive="true"
                    className="pointer-events-auto"
                    style={{ cursor: pe.tasks === 'none' ? 'default' : 'pointer', pointerEvents: pe.tasks }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!allowPick.tasks) return;
                      setMapSelectedTaskId(tid);
                      setMapSelectedGroupId(taskGroupId || null);
                      setMapSelectedRobotId(null);
                      setMapSelectedObstacleId(null);
                      setMapSidebarTab('tasks');
                    }}
                  >
                    <title>{`${String(t.name ?? 'Task')} (${String(t.taskStatus ?? '')})`}</title>
                    {nodes}
                  </g>
                );
              })}
            </svg>

            {/* After tasks in DOM so polygons win over routes; svg root none → gaps fall through to tasks */}
            <svg className="absolute inset-0" width={MAP_W} height={MAP_H} style={{ pointerEvents: 'none' }}>
              {mapObstaclesView
                .filter((o) => Boolean((o as Record<string, unknown>).active))
                .map((o, idx) => {
                  const raw = (o as Record<string, unknown>).points;
                  if (!Array.isArray(raw)) return null;
                  const pts: { x: number; y: number }[] = [];
                  for (const item of raw) {
                    if (!Array.isArray(item) || item.length !== 2) return null;
                    const [x, y] = item as [unknown, unknown];
                    const nx = Number(x);
                    const ny = Number(y);
                    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
                    pts.push({ x: nx, y: ny });
                  }
                  if (pts.length < 3) return null;
                  const d = pts
                    .map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`)
                    .join(' ');
                  const oid = bsonId(o);
                  const key = oid || `ob_${idx}`;
                  const selected = oid && oid === mapSelectedObstacleId;
                  const name = String((o as Record<string, unknown>).name ?? 'Obstacle');
                  const polyPe = pe.obstacles === 'none' ? 'none' : 'auto';
                  return (
                    <g key={key}>
                      <polygon
                        data-map-interactive="true"
                        points={d}
                        fill="rgba(249, 115, 22, 0.18)"
                        stroke={selected ? 'rgba(19, 127, 236, 0.95)' : 'rgba(249, 115, 22, 0.85)'}
                        strokeWidth={selected ? 3 : 2}
                        pointerEvents={polyPe}
                        style={{ cursor: pe.obstacles === 'none' ? 'default' : 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!allowPick.obstacles) return;
                          if (!oid) return;
                          setMapSelectedObstacleId(oid);
                          setMapSelectedRobotId(null);
                          setMapSelectedTaskId(null);
                          setMapSelectedGroupId(null);
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as SVGPolygonElement).style.fill = 'rgba(249, 115, 22, 0.26)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as SVGPolygonElement).style.fill = 'rgba(249, 115, 22, 0.18)';
                        }}
                        aria-label={name}
                      />
                      {selected &&
                        pts.map((p, vi) => (
                          <circle
                            key={`${key}_v_${vi}`}
                            cx={p.x * MAP_CELL + MAP_CELL / 2}
                            cy={p.y * MAP_CELL + MAP_CELL / 2}
                            r={4}
                            fill="rgba(254, 243, 199, 0.95)"
                            stroke="rgba(15, 23, 42, 0.9)"
                            strokeWidth={1}
                            pointerEvents="none"
                          />
                        ))}
                    </g>
                  );
                })}
            </svg>

            {mapTool?.kind === 'obstacle' && mapDraftPts.length >= 1 && (
              <svg className="absolute inset-0 pointer-events-none" width={MAP_W} height={MAP_H}>
                <polyline
                  points={mapDraftPts.map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                  fill="none"
                  stroke="rgba(19,127,236,0.95)"
                  strokeWidth={2}
                />
                {mapDraftPts.map((p, i) => (
                  <circle key={i} cx={p.x * MAP_CELL + MAP_CELL / 2} cy={p.y * MAP_CELL + MAP_CELL / 2} r={5} fill="rgba(19,127,236,0.95)" />
                ))}
              </svg>
            )}

            {mapTool?.kind === 'task' && (mapDraftPts.length >= 1 || mapPlannedPts.length >= 1) && (
              <svg className="absolute inset-0 pointer-events-none" width={MAP_W} height={MAP_H}>
                {mapDraftPts.length >= 1 && (
                  <>
                    <polyline
                      points={mapDraftPts.map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                      fill="none"
                      stroke="rgba(34,197,94,0.95)"
                      strokeWidth={2}
                    />
                    {mapDraftPts.map((p, i) => (
                      <circle key={`main_${i}`} cx={p.x * MAP_CELL + MAP_CELL / 2} cy={p.y * MAP_CELL + MAP_CELL / 2} r={5} fill="rgba(34,197,94,0.95)" />
                    ))}
                  </>
                )}
                {mapPlannedPts.length >= 1 && (
                  <>
                    <polyline
                      points={mapPlannedPts.map((p) => `${p.x * MAP_CELL + MAP_CELL / 2},${p.y * MAP_CELL + MAP_CELL / 2}`).join(' ')}
                      fill="none"
                      stroke="rgba(168,85,247,0.95)"
                      strokeWidth={2}
                    />
                    {mapPlannedPts.map((p, i) => (
                      <circle key={`pl_${i}`} cx={p.x * MAP_CELL + MAP_CELL / 2} cy={p.y * MAP_CELL + MAP_CELL / 2} r={4} fill="rgba(168,85,247,0.95)" />
                    ))}
                  </>
                )}
              </svg>
            )}

            {mapView.filtered.map((r) => {
              const id = bsonId(r);
              if (!id) return null;
              const xy = robotCoordinatesFromDoc(r as Record<string, unknown>) ?? coordFromOid(id);
              const x = Number.isFinite(xy.x) ? Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xy.x))) : 0;
              const y = Number.isFinite(xy.y) ? Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(xy.y))) : 0;
              const top = y * MAP_CELL + MAP_CELL / 2;
              const left = x * MAP_CELL + MAP_CELL / 2;
              const active = id === mapSelectedRobotId;
              const inGroup = mapSelectedGroupId
                ? refId((r as Record<string, unknown>).groupId) === mapSelectedGroupId
                : false;
              const off = robotIsOffline(r as Record<string, unknown>);
              return (
                <button
                  key={id}
                  type="button"
                  data-map-interactive="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!allowPick.robots) return;
                    setMapSelectedRobotId(id);
                    setMapSelectedObstacleId(null);
                    setMapSelectedTaskId(null);
                  }}
                  className={`absolute h-10 w-10 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-offset-4 ring-offset-slate-950 transition-colors ${
                    off
                      ? 'bg-amber-500/10 ring-amber-500/70 hover:ring-amber-400'
                      : active
                        ? 'bg-[#137fec]/20 ring-[#137fec]'
                        : inGroup
                          ? 'bg-emerald-500/15 ring-emerald-500/80 hover:ring-emerald-400'
                          : 'bg-slate-700/20 ring-slate-700 hover:ring-slate-500'
                  }`}
                  style={{ top, left, pointerEvents: pe.robots }}
                  title={`${String(r.name ?? 'Robot')} · ${off ? 'offline' : 'online'}`}
                >
                  <MapRobotNavIcon
                    className={`w-6 h-6 shrink-0 ${
                      off ? 'text-amber-400/90' : active ? 'text-[#137fec]' : inGroup ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  />
                </button>
              );
            })}
            </div>

            <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
              <MapAxesOverlay />
            </div>
          </div>
        </div>

        {(mapView.selected || mapSelectedObstacleId || mapSelectedTaskId) && (
          <div className="absolute right-4 top-4 w-80 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              {mapView.selected ? (
                <div>
                  <MapRecordTitleNav
                    title={String(mapView.selected.name ?? '—')}
                    disabledReason={bsonId(mapView.selected as Record<string, unknown>) ? undefined : 'No id for this robot.'}
                    onOpen={() => {
                      const id = bsonId(mapView.selected as Record<string, unknown>);
                      if (!id) return;
                      (navigate as (p: string) => void)(ROUTES.entityDetail('robots', id));
                      (bump as () => void)();
                    }}
                  />
                  <div className="text-xs text-slate-500 mt-1">{String(mapView.selected.model ?? '—')}</div>
                  <div className="text-xs text-slate-500">
                    Status:{' '}
                    {robotIsOffline(mapView.selected as Record<string, unknown>) ? (
                      <span className="text-amber-400/90">offline</span>
                    ) : (
                      <span className="text-slate-300">online</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">Group: {String(mapView.selected.groupName ?? '—')}</div>
                </div>
              ) : mapSelectedTaskId ? (
                <div>
                  {(() => {
                    const tk = mapTasks.find((x) => bsonId(x) === mapSelectedTaskId);
                    return (
                      <>
                        <MapRecordTitleNav
                          title={String(tk?.name ?? 'Task')}
                          onOpen={() => {
                            const id = mapSelectedTaskId;
                            if (!id) return;
                            (navigate as (p: string) => void)(ROUTES.entityDetail('tasks', id));
                            (bump as () => void)();
                          }}
                        />
                        <div className="text-xs text-slate-500 mt-1">
                          {String(tk?.type ?? '—')} · {String(tk?.taskStatus ?? '—')}
                        </div>
                        <div className="text-xs text-slate-500">Group: {String(tk?.groupName ?? '—')}</div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div>
                  {(() => {
                    const ob = mapSelectedObstacleId ? mapObstacles.find((x) => bsonId(x) === mapSelectedObstacleId) : null;
                    const oid = ob ? bsonId(ob as Record<string, unknown>) : '';
                    return (
                      <>
                        <MapRecordTitleNav
                          title={String((ob as Record<string, unknown>)?.name ?? 'Obstacle')}
                          disabledReason={oid ? undefined : 'No id for this obstacle.'}
                          onOpen={() => {
                            if (!oid) return;
                            (navigate as (p: string) => void)(ROUTES.entityDetail('obstacles', oid));
                            (bump as () => void)();
                          }}
                        />
                        <div className="text-xs text-slate-500 mt-1">Obstacle</div>
                      </>
                    );
                  })()}
                </div>
              )}
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
                onClick={() => {
                  setMapSelectedRobotId(null);
                  setMapSelectedObstacleId(null);
                  setMapSelectedTaskId(null);
                  setMapSelectedGroupId(null);
                }}
              >
                Close
              </button>
            </div>
            {mapView.selected ? (
              <div className="pt-3 mt-3 border-t border-slate-700 text-xs text-slate-400 space-y-1">
                <div>
                  <span className="text-slate-500">_id:</span> <span className="font-mono text-slate-200">{bsonId(mapView.selected)}</span>
                </div>
                <div>
                  <span className="text-slate-500">coords:</span>{' '}
                  <span className="font-mono text-slate-200">
                    {(() => {
                      const id = bsonId(mapView.selected);
                      const xy =
                        robotCoordinatesFromDoc(mapView.selected as Record<string, unknown>) ?? coordFromOid(id);
                      const x = Number.isFinite(xy.x) ? Math.max(0, Math.min(MAP_COLS - 1, Math.floor(xy.x))) : 0;
                      const y = Number.isFinite(xy.y) ? Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(xy.y))) : 0;
                      return `x=${x}, y=${y}`;
                    })()}
                  </span>
                </div>
              </div>
            ) : mapSelectedTaskId ? (
              <div className="pt-3 mt-3 border-t border-slate-700 text-xs text-slate-400 space-y-1">
                {(() => {
                  const tk = mapTasks.find((x) => bsonId(x) === mapSelectedTaskId);
                  const sp = tk ? parseTaskSpatial(tk as Record<string, unknown>) : { main: [], planned: [], scan: undefined };
                  return (
                    <>
                      <div>
                        <span className="text-slate-500">_id:</span>{' '}
                        <span className="font-mono text-slate-200">{mapSelectedTaskId}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">main route pts:</span> <span className="text-slate-200">{sp.main.length}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">planned pts:</span> <span className="text-slate-200">{sp.planned.length}</span>
                      </div>
                      {sp.scan && (
                        <div>
                          <span className="text-slate-500">scan radius:</span>{' '}
                          <span className="font-mono text-slate-200">
                            c=({sp.scan.cx},{sp.scan.cy}) r={sp.scan.r}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="pt-3 mt-3 border-t border-slate-700 text-xs text-slate-400 space-y-1">
                {(() => {
                  const ob = mapSelectedObstacleId ? mapObstacles.find((x) => bsonId(x) === mapSelectedObstacleId) : null;
                  const oid = ob ? bsonId(ob) : '';
                  const pts = Array.isArray((ob as Record<string, unknown>)?.points)
                    ? ((ob as Record<string, unknown>).points as unknown[])
                    : [];
                  return (
                    <>
                      <div>
                        <span className="text-slate-500">_id:</span> <span className="font-mono text-slate-200">{oid || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">points:</span> <span className="text-slate-200">{pts.length || 0}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">bounds:</span>{' '}
                        <span className="font-mono text-slate-200">
                          {`x=${String((ob as Record<string, unknown>)?.minX ?? '—')}..${String((ob as Record<string, unknown>)?.maxX ?? '—')}, y=${String((ob as Record<string, unknown>)?.minY ?? '—')}..${String((ob as Record<string, unknown>)?.maxY ?? '—')}`}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </section>
  );
}
