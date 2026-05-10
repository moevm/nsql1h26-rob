import React, { useMemo } from 'react';
import {
  MAP_AXIS_PAD_BOTTOM,
  MAP_AXIS_PAD_LEFT,
  MAP_CELL,
  MAP_COLS,
  MAP_CONTENT_HEIGHT,
  MAP_CONTENT_WIDTH,
  MAP_H,
  MAP_ROWS,
  MAP_W,
} from '../mapConstants';

const TICK_STEP = 10;
const SPINE_STROKE = 'rgba(148, 163, 184, 0.42)';
const TICK_STROKE = 'rgba(148, 163, 184, 0.38)';
const LABEL_FILL = 'rgba(148, 163, 184, 0.62)';

function axisIndices(extentCells: number, step: number): number[] {
  const hi = extentCells - 1;
  const out: number[] = [];
  for (let i = 0; i <= hi; i += step) {
    out.push(i);
  }
  if (out[out.length - 1] !== hi) {
    out.push(hi);
  }
  return out;
}

export function MapAxesOverlay({ tickStep = TICK_STEP }: { tickStep?: number }) {
  const pl = MAP_AXIS_PAD_LEFT;
  const xIdx = useMemo(() => axisIndices(MAP_COLS, tickStep), [tickStep]);
  const yIdx = useMemo(() => axisIndices(MAP_ROWS, tickStep), [tickStep]);

  return (
    <svg
      className="pointer-events-none block shrink-0"
      width={MAP_CONTENT_WIDTH}
      height={MAP_CONTENT_HEIGHT}
      aria-hidden="true"
    >
      <rect x={0} y={0} width={pl} height={MAP_H} fill="rgba(15, 23, 42, 0.35)" />
      <rect x={pl} y={MAP_H} width={MAP_W} height={MAP_AXIS_PAD_BOTTOM} fill="rgba(15, 23, 42, 0.35)" />

      <line
        x1={pl}
        y1={MAP_H - 0.5}
        x2={pl + MAP_W}
        y2={MAP_H - 0.5}
        stroke={SPINE_STROKE}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
      <line x1={pl + 0.25} y1={0} x2={pl + 0.25} y2={MAP_H} stroke={SPINE_STROKE} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />

      <g>
        {xIdx.map((i) => {
          const cx = pl + i * MAP_CELL + MAP_CELL / 2;
          return (
            <g key={`xt_${i}`}>
              <line x1={cx} y1={MAP_H - 0.5} x2={cx} y2={MAP_H - 10} stroke={TICK_STROKE} strokeWidth={1} />
              <text
                x={cx}
                y={MAP_H + 14}
                textAnchor="middle"
                dominantBaseline="auto"
                fill={LABEL_FILL}
                fontSize={9}
                fontFamily="ui-monospace, monospace"
              >
                {i}
              </text>
            </g>
          );
        })}
        {yIdx.map((j) => {
          const cy = j * MAP_CELL + MAP_CELL / 2;
          return (
            <g key={`yt_${j}`}>
              <line x1={pl} y1={cy} x2={pl - 10} y2={cy} stroke={TICK_STROKE} strokeWidth={1} />
              <text
                x={pl - 12}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
                fill={LABEL_FILL}
                fontSize={9}
                fontFamily="ui-monospace, monospace"
              >
                {j}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
