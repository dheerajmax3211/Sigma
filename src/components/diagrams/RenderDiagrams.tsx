"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CircuitDiagram, MermaidDiagram, PlotDiagram } from "@/lib/content/schema";
import { InlineMath } from "@/components/CodeEditor";

/** Diagram titles are authored with inline math; an accessible name must be plain text. */
function plainLabel(text: string): string {
  return text.replace(/\$([^$]+)\$/g, "$1").replace(/[*_`]/g, "").trim();
}

/**
 * Mermaid renderer.
 *
 * Mermaid handles the long tail of diagram syntax (sequence diagrams, state
 * machines, gantt, class diagrams) that no hand-rolled renderer should
 * reimplement. It is themed to the app's own tokens so it does not look
 * pasted in.
 */
export function MermaidDiagram({ d }: { d: MermaidDiagram }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          fontFamily: '"Inter", system-ui, sans-serif',
          themeVariables: {
            background: "#0b0e13",
            primaryColor: "#10141b",
            primaryTextColor: "#d7dbe0",
            primaryBorderColor: "#ffffff26",
            lineColor: "#9aa4b2",
            secondaryColor: "#161b24",
            tertiaryColor: "#0b0e13",
            textColor: "#d7dbe0",
            mainBkg: "#10141b",
            nodeBorder: "#ffffff26",
            clusterBkg: "#0b0e13",
            clusterBorder: "#ffffff17",
            edgeLabelBackground: "#0b0e13",
            titleColor: "#1cd6ac",
            actorBkg: "#10141b",
            actorBorder: "#ffffff26",
            actorTextColor: "#d7dbe0",
            signalColor: "#9aa4b2",
            signalTextColor: "#d7dbe0",
            labelBoxBkgColor: "#10141b",
            labelBoxBorderColor: "#ffffff26",
            labelTextColor: "#d7dbe0",
            loopTextColor: "#d7dbe0",
            noteBkgColor: "#161b24",
            noteTextColor: "#d7dbe0",
            noteBorderColor: "#ffffff26",
          },
        });
        const { svg } = await mermaid.render(`mmd-${id}`, d.code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [d.code, id]);

  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-line bg-surface-1">
      {d.title && (
        <figcaption className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="text-[13px] font-semibold text-fg">
            <InlineMath source={d.title} />
          </span>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            mermaid
          </span>
        </figcaption>
      )}
      <div className="overflow-x-auto px-4 py-4">
        {error ? (
          <div className="rounded-lg border border-brand-pink/30 bg-brand-pink/[0.07] px-3.5 py-2.5">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-brand-pink">
              Diagram error
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[11.5px] text-brand-pink">{error}</pre>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-ink-dimmer">
              {d.code}
            </pre>
          </div>
        ) : (
          <div ref={ref} className="mermaid-host flex justify-center" />
        )}
      </div>
    </figure>
  );
}

/** Series colours, cycled. */
const SERIES = ["#1cd6ac", "#f97316", "#a78bfa", "#38bdf8", "#f472b6", "#fbbf24"];

/** A real chart: axes, ticks, gridlines, and direct series labels. */
export function PlotDiagram({ d }: { d: PlotDiagram }) {
  const W = 640;
  const H = 300;
  const M = { top: 16, right: 16, bottom: 34, left: 46 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const xs = d.series.flatMap((s) => s.points.map((p) => p.x));
  const ys = d.series.flatMap((s) => s.points.map((p) => p.y));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys);

  const sx = (x: number) => M.left + ((x - xMin) / Math.max(xMax - xMin, 1e-9)) * iw;
  const sy = (y: number) => M.top + ih - ((y - yMin) / Math.max(yMax - yMin, 1e-9)) * ih;

  const yTicks = 5;
  const xTicks = Math.min(6, Math.max(2, new Set(xs).size));

  // Screen readers get the chart's meaning, not 640px of path data.
  const label = `${d.chart} chart${d.title ? `: ${plainLabel(d.title)}` : ""} — series: ${d.series
    .map((s) => plainLabel(s.name))
    .join(", ")}`;

  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-line bg-surface-1">
      {d.title && (
        <figcaption className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="text-[13px] font-semibold text-fg">
            <InlineMath source={d.title} />
          </span>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            {d.chart}
          </span>
        </figcaption>
      )}
      <div className="px-3 py-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={label}
        >
          {/* Gridlines + y ticks */}
          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const v = yMin + ((yMax - yMin) * i) / yTicks;
            const y = sy(v);
            return (
              <g key={i}>
                <line
                  x1={M.left}
                  y1={y}
                  x2={M.left + iw}
                  y2={y}
                  stroke="#ffffff12"
                  strokeWidth="1"
                />
                <text
                  x={M.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="#626c7a"
                  fontFamily="ui-monospace, monospace"
                >
                  {Number(v.toFixed(3))}
                </text>
              </g>
            );
          })}

          {/* X ticks */}
          {Array.from({ length: xTicks }, (_, i) => {
            const v = xMin + ((xMax - xMin) * i) / (xTicks - 1);
            return (
              <text
                key={i}
                x={sx(v)}
                y={M.top + ih + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#626c7a"
                fontFamily="ui-monospace, monospace"
              >
                {Number(v.toFixed(2))}
              </text>
            );
          })}

          {/* Axes */}
          <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + ih} stroke="#ffffff30" strokeWidth="1.2" />
          <line
            x1={M.left}
            y1={M.top + ih}
            x2={M.left + iw}
            y2={M.top + ih}
            stroke="#ffffff30"
            strokeWidth="1.2"
          />

          {/* Series */}
          {d.series.map((s, si) => {
            const color = SERIES[si % SERIES.length];
            if (d.chart === "bar") {
              const bw = Math.max(3, (iw / Math.max(s.points.length, 1)) * 0.6);
              return (
                <g key={s.name}>
                  {s.points.map((p, i) => {
                    const x = sx(p.x) - bw / 2;
                    const y = sy(p.y);
                    const h = M.top + ih - y;
                    return <rect key={i} x={x} y={y} width={bw} height={Math.max(0, h)} fill={color} rx="2" />;
                  })}
                </g>
              );
            }
            if (d.chart === "scatter") {
              return (
                <g key={s.name}>
                  {s.points.map((p, i) => (
                    <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={color} opacity="0.85" />
                  ))}
                </g>
              );
            }
            const path = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`)
              .join(" ");
            const area = d.chart === "area";
            return (
              <g key={s.name}>
                {area && (
                  <path
                    d={`${path} L ${sx(s.points[s.points.length - 1].x)} ${M.top + ih} L ${sx(s.points[0].x)} ${M.top + ih} Z`}
                    fill={color}
                    opacity="0.12"
                  />
                )}
                <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                {s.points.map((p, i) => (
                  <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="2.6" fill={color} />
                ))}
              </g>
            );
          })}

          {/* Axis labels */}
          {d.xLabel && (
            <text
              x={M.left + iw / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize="10.5"
              fill="#9aa4b2"
              fontFamily="system-ui, sans-serif"
            >
              {d.xLabel}
            </text>
          )}
          {d.yLabel && (
            <text
              x="12"
              y={M.top + ih / 2}
              textAnchor="middle"
              fontSize="10.5"
              fill="#9aa4b2"
              fontFamily="system-ui, sans-serif"
              transform={`rotate(-90 12 ${M.top + ih / 2})`}
            >
              {d.yLabel}
            </text>
          )}

          {/* Direct series labels (no legend needed) */}
          {d.series.map((s, si) => (
            <g key={s.name}>
              <rect
                x={M.left + 8}
                y={M.top + 6 + si * 15}
                width="8"
                height="8"
                rx="2"
                fill={SERIES[si % SERIES.length]}
              />
              <text
                x={M.left + 21}
                y={M.top + 14 + si * 15}
                fontSize="10.5"
                fill="#9aa4b2"
                fontFamily="system-ui, sans-serif"
              >
                {s.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

/** A minimal schematic circuit — kept from the reference app's electronics corpus. */
export function CircuitDiagram({ d }: { d: CircuitDiagram }) {
  const COL = 150;
  const ROW = 92;
  const positions = new Map<string, { x: number; y: number }>();
  d.components.forEach((c, i) => {
    positions.set(c.id, { x: 60 + (i % 3) * COL, y: 50 + Math.floor(i / 3) * ROW });
  });
  const W = 60 + Math.min(d.components.length, 3) * COL + 40;
  const H = 50 + Math.ceil(Math.max(d.components.length, 1) / 3) * ROW + 20;

  const GLYPH: Record<string, string> = {
    source: "⏚",
    resistor: "▭",
    capacitor: "‖",
    led: "☀",
    switch: "⌁",
    ic: "▣",
    wire: "─",
  };

  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-line bg-surface-1">
      {d.title && (
        <figcaption className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="text-[13px] font-semibold text-fg">
            <InlineMath source={d.title} />
          </span>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            circuit
          </span>
        </figcaption>
      )}
      <div className="overflow-x-auto px-4 py-4">
        <svg
          width={W}
          height={H}
          className="min-w-full"
          role="img"
          aria-label={d.title ? `Circuit diagram: ${plainLabel(d.title)}` : "Circuit diagram"}
        >
          {d.connections.map((c, i) => {
            const a = positions.get(c.from);
            const b = positions.get(c.to);
            if (!a || !b) return null;
            return (
              <path
                key={i}
                d={`M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`}
                fill="none"
                stroke="#9aa4b2"
                strokeWidth="1.6"
              />
            );
          })}
          {d.components.map((c) => {
            const p = positions.get(c.id)!;
            return (
              <g key={c.id} transform={`translate(${p.x},${p.y})`}>
                <rect x="-38" y="-22" width="76" height="44" rx="8" fill="#10141b" stroke="#ffffff26" />
                <text x="-26" y="4" fontSize="13" fill="#1cd6ac" fontFamily="ui-monospace, monospace">
                  {GLYPH[c.kind] ?? "▣"}
                </text>
                <text x="-12" y="-2" fontSize="10.5" fill="#d7dbe0" fontFamily="system-ui, sans-serif">
                  {c.label}
                </text>
                {c.value && (
                  <text x="-12" y="12" fontSize="9.5" fill="#626c7a" fontFamily="ui-monospace, monospace">
                    {c.value}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
