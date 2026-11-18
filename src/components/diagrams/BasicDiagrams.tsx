"use client";

import { useState } from "react";
import { InlineMath } from "@/components/CodeEditor";
import type {
  CompareDiagram,
  CycleDiagram,
  GraphDiagram,
  PipelineDiagram,
  SequenceDiagram,
  StackDiagram,
} from "@/lib/content/schema";

/** Diagram titles are authored with inline math; an accessible name must be plain text. */
function plainLabel(text: string): string {
  return text.replace(/\$([^$]+)\$/g, "$1").replace(/[*_`]/g, "").trim();
}

/** Shared frame so every diagram type looks like part of one system. */
function Frame({
  title,
  kind,
  children,
  footer,
}: {
  title?: string;
  kind: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-line bg-surface-1">
      {title && (
        <figcaption className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="text-[13px] font-semibold text-fg">
            <InlineMath source={title} />
          </span>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            {kind}
          </span>
        </figcaption>
      )}
      <div className="px-4 py-4">{children}</div>
      {footer && (
        <div className="border-t border-line px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-dimmer">
          {footer}
        </div>
      )}
    </figure>
  );
}

/** Side-by-side contrast. The workhorse diagram type. */
export function CompareDiagram({ d }: { d: CompareDiagram }) {
  return (
    <Frame title={d.title} kind="compare">
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { label: d.left_label, points: d.left_points, color: "#f97316", glyph: "✕" },
          { label: d.right_label, points: d.right_points, color: "#1cd6ac", glyph: "✓" },
        ].map((side) => (
          <div
            key={side.label}
            className="rounded-xl border border-line bg-surface-2 p-4"
            style={{ borderLeftWidth: 3, borderLeftColor: side.color }}
          >
            <div className="mb-2.5 flex items-center gap-2">
              <span style={{ color: side.color }} className="font-mono text-[12px]">
                {side.glyph}
              </span>
              <h3 className="text-[13.5px] font-semibold text-fg">
                <InlineMath source={side.label} />
              </h3>
            </div>
            <ul className="flex flex-col gap-1.5">
              {side.points.map((p, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink-dim">
                  <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full" style={{ background: side.color }} />
                  <span>
                    <InlineMath source={p} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A left-to-right flow of steps. Click a step to expand its detail. */
export function PipelineDiagram({ d }: { d: PipelineDiagram }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Frame title={d.title} kind="pipeline">
      <div className="flex flex-col gap-2">
        {d.nodes.map((n, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <button
                onClick={() => setOpen((p) => (p === i ? null : i))}
                className="group flex w-full items-center gap-3 text-left"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-brand/30 bg-brand/10 font-mono text-[11px] font-bold text-brand transition group-hover:bg-brand/20">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3.5 py-2 transition group-hover:border-line-2">
                  <span className="block text-[13px] font-medium text-fg">
                      <InlineMath source={n.label} />
                    </span>
                  {n.note && (
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-dimmer">
                        <InlineMath source={n.note} />
                      </span>
                  )}
                </span>
              </button>
            </div>
            {i < d.nodes.length - 1 && (
              <div className="flex h-5 w-7 shrink-0 justify-center">
                <svg width="10" height="20" viewBox="0 0 10 20" aria-hidden>
                  <path d="M5 0 L5 14" stroke="#ffffff30" strokeWidth="1.5" />
                  <path d="M1.5 12 L5 17 L8.5 12" fill="none" stroke="#ffffff30" strokeWidth="1.5" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
      {open !== null && d.nodes[open]?.detail && (
        <div className="mt-3 animate-rise rounded-lg border border-brand/25 bg-brand/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-fg">
          <InlineMath source={d.nodes[open].detail} />
        </div>
      )}
    </Frame>
  );
}

/** Layered stack, like a protocol or a memory hierarchy. */
export function StackDiagram({ d }: { d: StackDiagram }) {
  const layers = d.reversed ? [...d.layers].reverse() : d.layers;
  return (
    <Frame title={d.title} kind="stack">
      <div className="flex flex-col gap-1">
        {layers.map((l, i) => {
          const t = layers.length === 1 ? 1 : i / (layers.length - 1);
          const alpha = 0.12 + t * 0.26;
          return (
            <div
              key={i}
              className="rounded-lg border px-4 py-2.5"
              style={{
                borderColor: `rgba(28,214,172,${0.18 + t * 0.4})`,
                background: `rgba(28,214,172,${alpha * 0.4})`,
              }}
            >
              <span className="text-[13px] text-fg">
                <InlineMath source={l} />
              </span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

/** A node-edge graph with an automatic radial layout. */
export function GraphDiagram({ d }: { d: GraphDiagram }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const n = d.nodes.length;
  const size = 260;
  const c = size / 2;
  const r = c - 34;

  const pos = new Map<string, { x: number; y: number }>();
  d.nodes.forEach((node, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos.set(node.id, { x: c + r * Math.cos(a), y: c + r * Math.sin(a) });
  });

  const neighbours = new Set<string>();
  if (hovered) {
    for (const e of d.edges) {
      if (e.from === hovered) neighbours.add(e.to);
      if (e.to === hovered) neighbours.add(e.from);
    }
  }

  return (
    <Frame title={d.title} kind="graph">
      <div className="flex flex-col items-center gap-3">
        <svg
          width={size}
          height={size}
          className="overflow-visible"
          role="img"
          aria-label={
            d.title ? `Graph diagram: ${plainLabel(d.title)}` : "Node-link graph diagram"
          }
        >
          {d.edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const on = hovered === e.from || hovered === e.to;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={on ? "#1cd6ac" : "#ffffff26"}
                strokeWidth={on ? 2 : 1.3}
              />
            );
          })}
          {d.nodes.map((node) => {
            const p = pos.get(node.id)!;
            const on = hovered === node.id || neighbours.has(node.id);
            return (
              <g
                key={node.id}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  r="20"
                  fill="#10141b"
                  stroke={on ? "#1cd6ac" : "#ffffff26"}
                  strokeWidth={on ? 2 : 1.2}
                />
                <text
                  textAnchor="middle"
                  dy="4"
                  fontSize="10.5"
                  fill={on ? "#d7dbe0" : "#9aa4b2"}
                  fontFamily="system-ui, sans-serif"
                >
                  {node.label.length > 9 ? `${node.label.slice(0, 9)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>
        {d.edges.some((e) => e.label) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {d.edges
              .filter((e) => e.label)
              .map((e, i) => (
                <li key={i} className="font-mono text-[11px] text-ink-dim">
                  {d.nodes.find((n) => n.id === e.from)?.label} →{" "}
                  <span className="text-brand">{e.label}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </Frame>
  );
}

/** A repeating loop. */
export function CycleDiagram({ d }: { d: CycleDiagram }) {
  const [active, setActive] = useState(0);
  return (
    <Frame title={d.title} kind="cycle">
      <div className="flex flex-col gap-2">
        {d.steps.map((s, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition ${
              active === i
                ? "border-brand/40 bg-brand/[0.07]"
                : "border-line bg-surface-2 hover:border-line-2"
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[11px] font-bold ${
                active === i ? "bg-brand/20 text-brand" : "bg-surface-3 text-ink-dimmer"
              }`}
            >
              {i + 1}
            </span>
            <span className="text-[13px] leading-relaxed text-fg">
              <InlineMath source={s} />
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-ink-dimmer">
        ↻ after step {d.steps.length}, return to step 1
      </p>
    </Frame>
  );
}

/** A vertical sequence of events. */
export function SequenceDiagram({ d }: { d: SequenceDiagram }) {
  return (
    <Frame title={d.title} kind="sequence">
      <ol className="relative ml-2 flex flex-col gap-3 border-l border-line pl-5">
        {d.items.map((item, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-brand bg-bg" />
            <p className="text-[13px] leading-relaxed text-ink-dim">
              <InlineMath source={item} />
            </p>
          </li>
        ))}
      </ol>
    </Frame>
  );
}
