import React, { useCallback, useRef } from 'react';

interface CircularRadiusDialProps {
  value: number | null;
  min?: number;
  max?: number;
  defaultValue?: number;
  presets?: number[];
  onChange: (radiusKm: number) => void;
  onClear: () => void;
}

const DIAL_SIZE = 132;
const CENTER = DIAL_SIZE / 2;
const TRACK_RADIUS = 50;
const START_ANGLE_DEG = 225; // 7:30 o'clock
const SWEEP_ANGLE_DEG = 270; // ends at 4:30 o'clock (135 deg)

function polarToCartesian(cx: number, cy: number, r: number, angleDegFromTop: number) {
  const rad = (angleDegFromTop * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  if (sweepDeg <= 0.1) return '';
  const clampedSweep = Math.min(359.9, sweepDeg);
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, startDeg + clampedSweep);
  const largeArcFlag = clampedSweep > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function CircularRadiusDial({
  value,
  min = 1,
  max = 20,
  defaultValue = 5,
  presets = [1, 5, 10, 15, 20],
  onChange,
  onClear,
}: CircularRadiusDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  const isActive = value !== null;
  const displayValue = value ?? defaultValue;
  const clampedDisplay = Math.min(max, Math.max(min, displayValue));
  const ratio = (clampedDisplay - min) / (max - min);
  const activeSweep = ratio * SWEEP_ANGLE_DEG;
  const thumbAngle = START_ANGLE_DEG + activeSweep;
  const thumbPos = polarToCartesian(CENTER, CENTER, TRACK_RADIUS, thumbAngle);

  const trackPath = describeArc(CENTER, CENTER, TRACK_RADIUS, START_ANGLE_DEG, SWEEP_ANGLE_DEG);
  const activePath = isActive
    ? describeArc(CENTER, CENTER, TRACK_RADIUS, START_ANGLE_DEG, activeSweep)
    : '';

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;

      const degFromTop = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const rel = (degFromTop - START_ANGLE_DEG + 360) % 360;

      let clampedRel = rel;
      if (rel > SWEEP_ANGLE_DEG) {
        clampedRel = rel <= 315 ? SWEEP_ANGLE_DEG : 0;
      }

      const nextRatio = clampedRel / SWEEP_ANGLE_DEG;
      const nextKm = Math.round(min + nextRatio * (max - min));
      onChange(Math.min(max, Math.max(min, nextKm)));
    },
    [max, min, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const current = value ?? defaultValue;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(max, current + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(min, current - 1));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      onChange(Math.min(max, current + 5));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      onChange(Math.max(min, current - 5));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  const ticks = [1, 5, 10, 15, 20];

  return (
    <div className="p-3 rounded-xl bg-[#1d1915] border border-[#362f24]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[#dfd7c8]">
          Search Radius Dial
        </span>
        {isActive ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-[#d8b66f] hover:text-[#f0d596] underline underline-offset-2 whitespace-nowrap shrink-0"
          >
            Any distance
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="text-xs font-medium text-[#d8b66f] hover:text-[#f0d596] underline underline-offset-2 whitespace-nowrap shrink-0"
          >
            Set {defaultValue} km
          </button>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Rotary Circular Dial */}
        <div className="relative shrink-0 select-none">
          <svg
            ref={svgRef}
            width={DIAL_SIZE}
            height={DIAL_SIZE}
            viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
            role="slider"
            tabIndex={0}
            aria-label="Search radius in kilometers"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={isActive ? clampedDisplay : undefined}
            aria-valuetext={
              isActive
                ? `${clampedDisplay} kilometers`
                : `Any distance (dial parked at ${defaultValue} kilometers)`
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            className="cursor-pointer touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8b66f] rounded-full"
          >
            {/* Outer subtle bezel ring */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={TRACK_RADIUS + 9}
              fill="#14110e"
              stroke="#312a20"
              strokeWidth="1"
            />

            {/* Perimeter tick marks */}
            {ticks.map((tickVal) => {
              const tickRatio = (tickVal - min) / (max - min);
              const tickDeg = START_ANGLE_DEG + tickRatio * SWEEP_ANGLE_DEG;
              const inner = polarToCartesian(CENTER, CENTER, TRACK_RADIUS - 9, tickDeg);
              const outer = polarToCartesian(CENTER, CENTER, TRACK_RADIUS - 5, tickDeg);
              const reached = isActive && clampedDisplay >= tickVal;
              return (
                <line
                  key={tickVal}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={reached ? '#d8b66f' : '#4a4133'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              );
            })}

            {/* Background circular track */}
            <path
              d={trackPath}
              fill="none"
              stroke="#2e2820"
              strokeWidth="8"
              strokeLinecap="round"
            />

            {/* Active champagne-gold circular progress arc */}
            {activePath && (
              <path
                d={activePath}
                fill="none"
                stroke="#d4af63"
                strokeWidth="8"
                strokeLinecap="round"
              />
            )}

            {/* Inner dial face */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={33}
              fill="#191612"
              stroke={isActive ? '#52442c' : '#2c261e'}
              strokeWidth="1"
            />

            {/* Interactive knob handle on circular track */}
            <circle
              cx={thumbPos.x}
              cy={thumbPos.y}
              r={6.5}
              fill={isActive ? '#f3ddb0' : '#8e8577'}
              stroke="#14110e"
              strokeWidth="2"
            />
          </svg>

          {/* Center Readout inside the circle */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span
              className={`font-mono tabular-nums text-base font-semibold leading-none ${
                isActive ? 'text-[#f7f2e7]' : 'text-[#b7afa1]'
              }`}
            >
              {isActive ? `${clampedDisplay} km` : 'Any'}
            </span>
            <span className="mt-1 text-[10px] text-[#9b9282] leading-none">
              {isActive ? 'Radius' : 'Drag dial'}
            </span>
          </div>
        </div>

        {/* Right Side: Precision Presets & Step Controls */}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[11px] text-[#b8afa0] leading-snug">
            Turn the dial or tap a distance to filter places on the map.
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {presets.map((km) => {
              const selected = value === km;
              return (
                <button
                  key={km}
                  type="button"
                  onClick={() => onChange(km)}
                  className={`px-2 py-1.5 text-[11px] font-mono tabular-nums font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-[#c8a45d] border-[#d8b66f] text-[#14110e] font-semibold'
                      : 'bg-[#14110e] border-[#312a20] text-[#ddd5c7] hover:border-[#6e5a36] hover:text-white'
                  }`}
                >
                  {km} km
                </button>
              );
            })}
            <button
              type="button"
              onClick={onClear}
              className={`px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap ${
                value === null
                  ? 'bg-[#2c251b] border-[#786138] text-[#f0d596]'
                  : 'bg-[#14110e] border-[#312a20] text-[#b8afa0] hover:text-white hover:border-[#4e4332]'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
