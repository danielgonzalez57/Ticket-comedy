"use client";

import { useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

const WIDTH = 560;
const HEIGHT = 160;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export function RevenueTrendChart({
  data,
}: {
  data: { date: string; revenue: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const max = Math.max(1, ...data.map((d) => d.revenue));
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: PAD_LEFT + i * stepX,
    y: PAD_TOP + innerH - (d.revenue / max) * innerH,
    ...d,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    `${linePath} L ${points[points.length - 1]?.x.toFixed(1)} ${PAD_TOP + innerH} ` +
    `L ${points[0]?.x.toFixed(1)} ${PAD_TOP + innerH} Z`;

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHover(closest);
  }

  const active = hover !== null ? points[hover] : null;
  const total = data.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div>
      <p className="mb-2 text-2xl font-semibold tabular-nums">
        {formatMoney(total)}
      </p>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* gridline */}
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={PAD_TOP + innerH}
            y2={PAD_TOP + innerH}
            stroke="var(--border)"
            strokeWidth={1}
          />
          {points.length > 1 && (
            <path d={areaPath} fill="var(--primary)" opacity={0.1} />
          )}
          {points.length > 1 && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {active && (
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD_TOP}
              y2={PAD_TOP + innerH}
              stroke="var(--border)"
              strokeWidth={1}
            />
          )}
          {active && (
            <circle
              cx={active.x}
              cy={active.y}
              r={4}
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          )}
          {points[0] && (
            <text
              x={points[0].x}
              y={HEIGHT - 6}
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              {shortDate(points[0].date)}
            </text>
          )}
          {points[points.length - 1] && (
            <text
              x={points[points.length - 1].x}
              y={HEIGHT - 6}
              textAnchor="end"
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              {shortDate(points[points.length - 1].date)}
            </text>
          )}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${(active.x / WIDTH) * 100}%` }}
          >
            <p className="text-muted-foreground">{shortDate(active.date)}</p>
            <p className="font-semibold tabular-nums text-popover-foreground">
              {formatMoney(active.revenue)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
