import React from 'react';
import {
  GlsBullseyePayload,
  GlsBullseyeSegment,
  GlsTrendPoint,
} from '../../horalixAiResults.types';

type Props = {
  bullseye?: GlsBullseyePayload | null;
};

type Point = {
  x: number;
  y: number;
};

const CENTER = 80;
const STATUS_COLORS: Record<string, string> = {
  normal: '#34d399',
  borderline: '#fde047',
  abnormal: '#f87171',
  green: '#34d399',
  yellow: '#fde047',
  red: '#f87171',
};

const RING_RADII: Record<number, [number, number]> = {
  0: [56, 74],
  1: [38, 56],
  2: [20, 38],
  3: [0, 20],
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatGlsValue(value?: number | null) {
  if (!isFiniteNumber(value)) {
    return '-';
  }

  return `${value.toFixed(1)}%`;
}

function formatStatus(value?: string | null) {
  if (!value) {
    return 'No reference';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function segmentFill(segment: GlsBullseyeSegment) {
  if (!segment.measured) {
    return '#182131';
  }

  return (
    STATUS_COLORS[String(segment.status || '').toLowerCase()] ||
    STATUS_COLORS[String(segment.color || '').toLowerCase()] ||
    '#64748b'
  );
}

function polarPoint(radius: number, angleDegrees: number): Point {
  const angle = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function sectorPath(startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) {
  const outerStart = polarPoint(outerRadius, startAngle);
  const outerEnd = polarPoint(outerRadius, endAngle);
  const innerEnd = polarPoint(innerRadius, endAngle);
  const innerStart = polarPoint(innerRadius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function SegmentShape({ segment }: { segment: GlsBullseyeSegment }) {
  const ring = isFiniteNumber(segment.ring) ? segment.ring : 0;
  const radii = RING_RADII[ring] || RING_RADII[0];
  const wedgeCount = isFiniteNumber(segment.wedge_count) && segment.wedge_count > 0
    ? segment.wedge_count
    : 1;
  const wedgeIndex = isFiniteNumber(segment.wedge_index) ? segment.wedge_index : 0;
  const fill = segmentFill(segment);
  const label = `${segment.name || segment.code || `Segment ${segment.id || ''}`}: ${
    segment.measured ? formatGlsValue(segment.value) : 'not measured'
  }`;

  if (ring === 3 || wedgeCount <= 1 || radii[0] === 0) {
    return (
      <circle
        cx={CENTER}
        cy={CENTER}
        r={radii[1]}
        fill={fill}
        stroke="#090D14"
        strokeWidth="1.4"
      >
        <title>{label}</title>
      </circle>
    );
  }

  const angleSize = 360 / wedgeCount;
  const startAngle = wedgeIndex * angleSize;
  const endAngle = startAngle + angleSize;

  return (
    <path
      d={sectorPath(startAngle, endAngle, radii[0], radii[1])}
      fill={fill}
      stroke="#090D14"
      strokeWidth="1.4"
    >
      <title>{label}</title>
    </path>
  );
}

function BullseyeChart({ segments }: { segments: GlsBullseyeSegment[] }) {
  const sortedSegments = [...segments].sort((left, right) => {
    const leftRing = isFiniteNumber(left.ring) ? left.ring : 0;
    const rightRing = isFiniteNumber(right.ring) ? right.ring : 0;
    const leftWedge = isFiniteNumber(left.wedge_index) ? left.wedge_index : 0;
    const rightWedge = isFiniteNumber(right.wedge_index) ? right.wedge_index : 0;
    return leftRing - rightRing || leftWedge - rightWedge;
  });

  return (
    <svg
      aria-label="ASE 17-segment GLS bullseye"
      viewBox="0 0 160 160"
      className="h-40 w-40 shrink-0"
      role="img"
    >
      <circle cx={CENTER} cy={CENTER} r="76" fill="#0E1420" />
      {sortedSegments.map(segment => (
        <SegmentShape key={segment.id || segment.code || segment.name} segment={segment} />
      ))}
      <circle cx={CENTER} cy={CENTER} r="76" fill="none" stroke="#334155" strokeWidth="1" />
    </svg>
  );
}

function completenessLabel(value?: string | null) {
  if (value === 'segmental') {
    return 'Segmental strain';
  }

  if (value === 'global_only') {
    return 'Global GLS only';
  }

  return 'GLS unavailable';
}

function TrendSparkline({ points }: { points: GlsTrendPoint[] }) {
  const validPoints = points.flatMap(point =>
    isFiniteNumber(point.value) ? [{ point, value: point.value }] : []
  );
  const values = validPoints.map(item => item.value);

  if (values.length < 2) {
    return null;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = Math.max(maxValue - minValue, 1);
  const width = 176;
  const height = 44;
  const padding = 5;
  const step = (width - padding * 2) / Math.max(validPoints.length - 1, 1);
  const coordinates = validPoints.map((item, index) => {
    return {
      point: item.point,
      x: padding + index * step,
      y: padding + ((item.value - minValue) / spread) * (height - padding * 2),
    };
  });
  const path = coordinates
    .map((coordinate, index) => `${index === 0 ? 'M' : 'L'} ${coordinate.x} ${coordinate.y}`)
    .join(' ');

  return (
    <svg
      aria-label="Longitudinal GLS trend"
      viewBox={`0 0 ${width} ${height}`}
      className="h-11 w-full"
      role="img"
    >
      <path d={path} fill="none" stroke="#60A5FA" strokeWidth="2" />
      {coordinates.map(coordinate => (
        <circle
          key={`${coordinate.point.study_uid || coordinate.point.label}-${coordinate.x}`}
          cx={coordinate.x}
          cy={coordinate.y}
          r="2.5"
          fill={STATUS_COLORS[String(coordinate.point.status || '').toLowerCase()] || '#60A5FA'}
        >
          <title>{`${coordinate.point.label || 'Study'}: ${formatGlsValue(coordinate.point.value)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function TrendList({ points }: { points: GlsTrendPoint[] }) {
  if (!points.length) {
    return null;
  }

  return (
    <div className="mt-2 rounded border border-[#1A2030] bg-[#0E1420] p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#A0A9BE]">
          GLS Trend
        </div>
        <div className="text-[9px] text-[#6B7FA3]">{points.length} studies</div>
      </div>
      <TrendSparkline points={points} />
      <div className="mt-1 grid grid-cols-1 gap-1">
        {points.slice(-4).map(point => (
          <div
            key={point.study_uid || point.label || point.study_date}
            className="flex items-center justify-between gap-2 text-[10px]"
          >
            <span className="truncate text-[#8D98B3]">{point.label || point.study_date || 'Study'}</span>
            <span className="font-semibold text-white">{formatGlsValue(point.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GlsBullseyePanel({ bullseye }: Props) {
  if (!bullseye) {
    return null;
  }

  const segments = Array.isArray(bullseye.segments) ? bullseye.segments : [];
  const trend = Array.isArray(bullseye.trend) ? bullseye.trend : [];
  const globalValue = bullseye.global?.value;
  const globalStatus = bullseye.global?.status;
  const measuredSegmentCount = isFiniteNumber(bullseye.measured_segment_count)
    ? bullseye.measured_segment_count
    : segments.filter(segment => segment.measured).length;

  return (
    <section className="overflow-hidden rounded border border-[#1A2030] bg-[#0B0F17]">
      <div className="flex items-center justify-between gap-2 bg-[#171C27] px-2 py-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#A0A9BE]">
          GLS Bullseye
        </div>
        <span className="rounded border border-[#243044] bg-[#0E1420] px-1.5 py-[1px] text-[9px] text-[#8D98B3]">
          {completenessLabel(bullseye.data_completeness)}
        </span>
      </div>

      <div className="p-2">
        <div className="flex flex-col items-center gap-2">
          <BullseyeChart segments={segments} />

          <div className="grid w-full grid-cols-2 gap-2 text-[10px]">
            <div className="rounded border border-[#1A2030] bg-[#0E1420] p-2">
              <div className="text-[#6B7FA3]">Global GLS</div>
              <div className="mt-0.5 text-[16px] font-bold leading-none text-white">
                {formatGlsValue(globalValue)}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[#8D98B3]">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      STATUS_COLORS[String(globalStatus || '').toLowerCase()] ||
                      '#64748b',
                  }}
                />
                {formatStatus(globalStatus)}
              </div>
            </div>

            <div className="rounded border border-[#1A2030] bg-[#0E1420] p-2">
              <div className="text-[#6B7FA3]">Segments</div>
              <div className="mt-0.5 text-[16px] font-bold leading-none text-white">
                {measuredSegmentCount}/17
              </div>
              <div className="mt-1 text-[#8D98B3]">Measured</div>
            </div>
          </div>
        </div>

        {bullseye.notes ? (
          <p className="mt-2 text-[10px] leading-snug text-[#8D98B3]">
            {bullseye.notes}
          </p>
        ) : null}

        <TrendList points={trend} />
      </div>
    </section>
  );
}
