"use client";

import { useMemo, useState } from "react";
import { InlineMath } from "@/components/CodeEditor";
import type { ArchEdge, ArchNode } from "@/lib/content/schema";

/**
 * Interactive architecture diagram.
 *
 * Nodes are placed on a grid (x = column, y = row) exactly as the reference app does,
 * but the renderer adds what a static diagram cannot give you:
 *
 *   - hover highlights a node *and its incident edges*, so you can trace a
 *     request path through the graph;
 *   - clicking a node pins it and reveals its `detail` prose underneath;
 *   - async edges animate, so a background path reads differently from a
 *     synchronous one;
 *   - the layout auto-fits, so a wide graph still fits its container.
 */

const CELL_W = 178;
const CELL_H = 96;
const PAD_X = 24;
const PAD_Y = 20;
const NODE_W = 150;
const NODE_H = 56;

type KindStyle = { color: string; glyph: string; label: string };

const KIND: Record<string, KindStyle> = {
  client: { color: "#38bdf8", glyph: "◆", label: "Client" },
  load_balancer: { color: "#a78bfa", glyph: "⛭", label: "Load balancer" },
  server: { color: "#1cd6ac", glyph: "▣", label: "Service" },
  database: { color: "#f97316", glyph: "⛁", label: "Datastore" },
  cache: { color: "#f472b6", glyph: "◈", label: "Cache" },
  worker: { color: "#fbbf24", glyph: "⚙", label: "Async worker" },
  queue: { color: "#c084fc", glyph: "≡", label: "Queue" },
  external: { color: "#626c7a", glyph: "○", label: "External" },
  model: { color: "#1cd6ac", glyph: "◉", label: "Model" },
  gpu: { color: "#f472b6", glyph: "⊞", label: "Accelerator" },
  storage: { color: "#f97316", glyph: "▤", label: "Object store" },
};

function styleFor(kind: string): KindStyle {
  return KIND[kind] ?? KIND.server;
}

interface Placed extends ArchNode {
  px: number;
  py: number;
}

export function ArchitectureDiagram({
  title,
  nodes,
  edges,
  caption,
}: {
  title?: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  caption?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const placed = useMemo<Placed[]>(
    () =>
      nodes.map((n) => ({
        ...n,
        px: PAD_X + n.x * CELL_W,
        py: PAD_Y + n.y * CELL_H,
      })),
    [nodes],
  );

  const byId = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed]);

  const cols = Math.max(...nodes.map((n) => n.x)) + 1;
  const rows = Math.max(...nodes.map((n) => n.y)) + 1;
  const width = PAD_X * 2 + (cols - 1) * CELL_W + NODE_W;
  const height = PAD_Y * 2 + (rows - 1) * CELL_H + NODE_H;

  const active = hovered ?? selected;

  const incident = useMemo(() => {
    if (!active) return new Set<string>();
    const s = new Set<string>();
    for (const e of edges) {
      if (e.from === active) s.add(e.to);
      if (e.to === active) s.add(e.from);
    }
    return s;
  }, [active, edges]);

  const detail = selected ? byId.get(selected)?.detail : undefined;

  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-line bg-surface-1">
      {title && (
        <figcaption className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="text-[13px] font-semibold text-fg">{title}</span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
            click a node for detail
          </span>
        </figcaption>
      )}

      {/*
        The diagram fills its container, scaling to fit.

        Architecture diagrams are authored to at most four columns (see
        docs/AUTHORING.md) so that scaling down keeps node text legible. A
        graph wider than that would have to scroll, and a diagram you read
        through a letterbox is not a diagram.
      */}
      <div className="px-4 py-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title ?? "Architecture diagram"}
        >
          <defs>
            {Object.entries(KIND).map(([k, v]) => (
              <marker
                key={k}
                id={`arch-arrow-${k}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={v.color} />
              </marker>
            ))}
            <marker
              id="arch-arrow-active"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffffff" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const isActive = active === e.from || active === e.to;
            const dim = Boolean(active) && !isActive;
            const color = isActive ? "#ffffff" : styleFor(a.kind).color;

            const x1 = a.px + NODE_W;
            const y1 = a.py + NODE_H / 2;
            const x2 = b.px;
            const y2 = b.py + NODE_H / 2;
            const mid = (x1 + x2) / 2;

            return (
              <g key={i} opacity={dim ? 0.22 : 1}>
                <path
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 2.2 : 1.5}
                  strokeDasharray={e.style === "async" ? "5 5" : undefined}
                  markerEnd={`url(#${isActive ? "arch-arrow-active" : `arch-arrow-${a.kind}`})`}
                >
                  {e.style === "async" && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from="10"
                      to="0"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  )}
                </path>
                {e.style === "bidirectional" && (
                  <path
                    d={`M ${x2} ${y2} C ${mid} ${y2}, ${mid} ${y1}, ${x1} ${y1}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={isActive ? 2.2 : 1.5}
                    markerEnd={`url(#${isActive ? "arch-arrow-active" : `arch-arrow-${a.kind}`})`}
                  />
                )}
                {e.label &&
                  (() => {
                    // On a short horizontal edge the curve is a few pixels
                    // long, so a centred label collides with both nodes.
                    // Lift it above the node row instead.
                    const gap = Math.abs(x2 - x1);
                    const short = gap < 100;
                    const lx = short ? Math.max(x1, x2) : (x1 + x2) / 2;
                    const ly = short ? Math.min(y1, y2) - 26 : (y1 + y2) / 2 - 6;
                    const w = e.label.length * 5.6 + 8;
                    return (
                      <g>
                        <rect
                          x={lx - w / 2}
                          y={ly - 9}
                          width={w}
                          height={13}
                          rx="3"
                          fill="#0b0e13"
                          opacity="0.92"
                        />
                        <text
                          x={lx}
                          y={ly}
                          textAnchor="middle"
                          fontSize="10.5"
                          fontFamily="ui-monospace, monospace"
                          fill={isActive ? "#d7dbe0" : "#9aa4b2"}
                        >
                          {e.label}
                        </text>
                      </g>
                    );
                  })()}
              </g>
            );
          })}

          {/* Nodes */}
          {placed.map((n) => {
            const s = styleFor(n.kind);
            const isActive = active === n.id;
            const isNeighbour = incident.has(n.id);
            const dim = Boolean(active) && !isActive && !isNeighbour;
            return (
              <g
                key={n.id}
                transform={`translate(${n.px}, ${n.py})`}
                opacity={dim ? 0.3 : 1}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected((p) => (p === n.id ? null : n.id))}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="9"
                  fill="#10141b"
                  stroke={isActive ? s.color : "#ffffff26"}
                  strokeWidth={isActive ? 2 : 1}
                />
                <rect
                  width="3.5"
                  height={NODE_H}
                  rx="1.75"
                  fill={s.color}
                  opacity={isActive ? 1 : 0.7}
                />
                <text
                  x="14"
                  y="22"
                  fontSize="13"
                  fill={s.color}
                  fontFamily="ui-monospace, monospace"
                >
                  {s.glyph}
                </text>
                {/*
                  Node labels may contain inline math. SVG <text> cannot host
                  KaTeX's HTML, so the label is placed in a foreignObject —
                  which renders real HTML inside the SVG coordinate system.
                */}
                <foreignObject x="30" y="8" width={NODE_W - 38} height="30">
                  {/*
                    `xmlns` is required for the XHTML namespace inside
                    foreignObject; React's DOM types do not know about it, so
                    it is spread through as an attribute.
                  */}
                  <div
                    {...{ xmlns: "http://www.w3.org/1999/xhtml" }}
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 560,
                      lineHeight: 1.2,
                      color: "#d7dbe0",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    <InlineMath source={n.label} />
                  </div>
                </foreignObject>
                <text
                  x="32"
                  y="46"
                  fontSize="9.5"
                  fill="#626c7a"
                  fontFamily="ui-monospace, monospace"
                >
                  {s.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {detail && (
        <div className="animate-rise border-t border-line bg-surface-2 px-4 py-3">
          <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-brand">
            {byId.get(selected!)?.label}
          </div>
          <p className="text-[13px] leading-relaxed text-ink-dim">
            <InlineMath source={detail} />
          </p>
        </div>
      )}

      {caption && (
        <p className="border-t border-line px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-dimmer">
          <InlineMath source={caption} />
        </p>
      )}
    </figure>
  );
}
