"use client";

import { useMemo, useState } from "react";

/**
 * The dependency explorer.
 *
 * This is the optional, second-screen view of the curriculum. The roadmap page
 * deliberately leads with milestone cards, because a 3,500px picture of 101
 * nodes is not a plan — it is a wall. The graph is still genuinely useful when
 * you want to answer one narrow question ("what does this topic need first?"),
 * so it lives here, collapsed, and it answers that question on hover instead of
 * asking the learner to read 154 arrows at once.
 *
 * Layout is computed, not authored: one block per track, topics in syllabus
 * order, wrapped every five nodes so the drawing never exceeds ~860px. The
 * container scrolls vertically; the page itself never scrolls sideways.
 */

const NODE_W = 150;
const NODE_H = 44;
const COL_GAP = 20;
const ROW_GAP = 18;
const PER_ROW = 5;
const PAD_X = 16;
const PAD_Y = 14;
const TRACK_HEADER_H = 28;
const TRACK_GAP = 24;

const TEAL = "#1cd6ac";
const ORANGE = "#f97316";
const EDGE_IDLE = "#2a3341";
const NODE_IDLE_FILL = "#0d1219";

export interface ExplorerNode {
  id: string;
  title: string;
  trackId: string;
  color: string;
  position: number;
}

export interface ExplorerEdge {
  from: string;
  to: string;
}

export interface ExplorerTrack {
  id: string;
  title: string;
  color: string;
}

interface Placed extends ExplorerNode {
  x: number;
  y: number;
}

/** Readable fallback when the caller only passes ids, e.g. "core-ml" → "Core Ml". */
function prettifyTrackId(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function RoadmapExplorer({
  nodes,
  edges,
  tracks,
}: {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
  /** Optional row headings, in curriculum order. */
  tracks?: ExplorerTrack[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  // Track filters. The graph is 101 nodes; nobody reads 101 nodes, but "just this
  // track, plus nothing else" is a question people actually ask of a dependency
  // map. Hiding a track also hides its edges, so the picture stays truthful.
  const [hiddenTracks, setHiddenTracks] = useState<ReadonlySet<string>>(new Set());
  const visibleNodes = useMemo(
    () => nodes.filter((n) => !hiddenTracks.has(n.trackId)),
    [nodes, hiddenTracks],
  );

  const { placed, rows, width, height, nodeById } = useMemo(() => {
    // Preserve the order the server sent: tracks arrive in tier order, topics
    // in position order, so grouping by first appearance keeps the picture
    // stable as content lands.
    const order: string[] = [];
    const grouped = new Map<string, ExplorerNode[]>();
    for (const node of visibleNodes) {
      if (!grouped.has(node.trackId)) {
        grouped.set(node.trackId, []);
        order.push(node.trackId);
      }
      grouped.get(node.trackId)!.push(node);
    }

    const titleByTrack = new Map((tracks ?? []).map((t) => [t.id, t.title]));
    const positions = new Map<string, Placed>();
    const rowMeta: { trackId: string; title: string; color: string; y: number }[] = [];

    let cursor = PAD_Y;
    for (const trackId of order) {
      const list = grouped.get(trackId)!;
      const rowCount = Math.max(1, Math.ceil(list.length / PER_ROW));

      rowMeta.push({
        trackId,
        title: titleByTrack.get(trackId) ?? prettifyTrackId(trackId),
        color: list[0]?.color ?? TEAL,
        y: cursor + 10,
      });

      const firstRowY = cursor + TRACK_HEADER_H;
      list.forEach((node, index) => {
        const row = Math.floor(index / PER_ROW);
        const col = index % PER_ROW;
        positions.set(node.id, {
          ...node,
          x: PAD_X + col * (NODE_W + COL_GAP),
          y: firstRowY + row * (NODE_H + ROW_GAP),
        });
      });

      cursor = firstRowY + rowCount * NODE_H + (rowCount - 1) * ROW_GAP + TRACK_GAP;
    }

    const totalWidth = PAD_X * 2 + PER_ROW * NODE_W + (PER_ROW - 1) * COL_GAP;
    const totalHeight = Math.max(120, cursor + PAD_Y - TRACK_GAP);

    return {
      placed: [...positions.values()],
      rows: rowMeta,
      width: totalWidth,
      height: totalHeight,
      nodeById: positions,
    };
  }, [visibleNodes, tracks]);

  // Direct neighbours of the hovered topic. Recomputed only when the hover
  // target changes, so moving across 101 nodes never re-renders the edge list
  // more than once per node.
  const { prerequisites, dependents, prereqNames, dependentNames } = useMemo(() => {
    if (!hovered) {
      return {
        prerequisites: new Set<string>(),
        dependents: new Set<string>(),
        prereqNames: [] as string[],
        dependentNames: [] as string[],
      };
    }
    const incoming = new Set<string>();
    const outgoing = new Set<string>();
    for (const edge of edges) {
      if (edge.to === hovered) incoming.add(edge.from);
      if (edge.from === hovered) outgoing.add(edge.to);
    }
    const name = (id: string) => nodeById.get(id)?.title ?? id;
    return {
      prerequisites: incoming,
      dependents: outgoing,
      prereqNames: [...incoming].map(name),
      dependentNames: [...outgoing].map(name),
    };
  }, [hovered, edges, nodeById]);

  const shownEdges = useMemo(
    () => edges.filter((e) => nodeById.has(e.from) && nodeById.has(e.to)),
    [edges, nodeById],
  );

  const hoveredNode = hovered ? nodeById.get(hovered) : undefined;
  const dimmed = hovered !== null;

  const trackList = tracks ?? [...new Set(nodes.map((n) => n.trackId))].map((id) => ({
    id,
    title: prettifyTrackId(id),
    color: nodes.find((n) => n.trackId === id)?.color ?? TEAL,
  }));

  return (
    <div className="w-full">
      {/* Filter the wall down to one track. Cheaper than a minimap and it answers
          the question people actually have: "show me just this row." */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
          tracks
        </span>
        {trackList.map((t) => {
          const off = hiddenTracks.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={!off}
              onClick={() =>
                setHiddenTracks((prev) => {
                  const next = new Set(prev);
                  if (next.has(t.id)) next.delete(t.id);
                  else next.add(t.id);
                  return next;
                })
              }
              className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition ${
                off
                  ? "border-line text-ink-dimmer line-through opacity-60"
                  : "border-line-2 text-fg"
              }`}
              style={off ? undefined : { borderColor: `${t.color}66`, color: t.color }}
              title={off ? `Show ${t.title}` : `Hide ${t.title}`}
            >
              {t.title}
            </button>
          );
        })}
        {hiddenTracks.size > 0 && (
          <button
            type="button"
            onClick={() => setHiddenTracks(new Set())}
            className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-ink-dim hover:text-fg"
          >
            all
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] text-ink-dimmer">
          {visibleNodes.length}/{nodes.length} topics
        </span>
      </div>
      {/* One line of plain words about whatever is under the pointer. */}
      <div className="flex min-h-[30px] flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 font-mono text-[10.5px] text-ink-dimmer">
        {hoveredNode ? (
          <>
            <span className="text-fg">{hoveredNode.title}</span>
            <span>
              <span className="text-brand">needs first</span> {prerequisites.size}
            </span>
            <span>
              <span className="text-brand-orange">unlocks next</span> {dependents.size}
            </span>
            {prereqNames.length > 0 && (
              <span className="max-w-full truncate" title={prereqNames.join(", ")}>
                ← {prereqNames.join(", ")}
              </span>
            )}
            {dependentNames.length > 0 && (
              <span className="max-w-full truncate" title={dependentNames.join(", ")}>
                → {dependentNames.join(", ")}
              </span>
            )}
          </>
        ) : (
          <span>
            Hover a topic to trace its path. Tab to one and press Enter to open it.
          </span>
        )}
      </div>

      <div className="overflow-auto rounded-xl border border-line bg-bg/60" style={{ maxHeight: "62vh" }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Topic dependency graph, one row per track. Hover a topic to highlight what it needs and what it unlocks."
          style={{ minWidth: width, display: "block" }}
        >
          <defs>
            <marker
              id="rm-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill={EDGE_IDLE} />
            </marker>
            <marker
              id="rm-arrow-teal"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill={TEAL} />
            </marker>
            <marker
              id="rm-arrow-orange"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill={ORANGE} />
            </marker>
          </defs>

          {rows.map((row) => (
            <g key={row.trackId}>
              <rect x={PAD_X} y={row.y - 8} width={4} height={4} rx={1} fill={row.color} />
              <text
                x={PAD_X + 10}
                y={row.y - 4}
                fill="#6b7684"
                fontFamily="ui-monospace, monospace"
                fontSize={9.5}
                letterSpacing={1.2}
              >
                {row.title.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Edges first, so nodes sit on top of them. */}
          {shownEdges.map((edge, index) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;

            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const bend = Math.max(26, Math.abs(x2 - x1) * 0.35);

            const isIncoming = hovered === edge.to;
            const isOutgoing = hovered === edge.from;
            const active = isIncoming || isOutgoing;

            const stroke = isOutgoing ? ORANGE : isIncoming ? TEAL : EDGE_IDLE;
            const marker = isOutgoing
              ? "url(#rm-arrow-orange)"
              : isIncoming
                ? "url(#rm-arrow-teal)"
                : "url(#rm-arrow)";

            return (
              <path
                key={`${edge.from}->${edge.to}-${index}`}
                data-from={edge.from}
                data-to={edge.to}
                d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={stroke}
                strokeWidth={active ? 1.7 : 1.15}
                strokeOpacity={dimmed ? (active ? 0.95 : 0.08) : 0.7}
                markerEnd={marker}
              />
            );
          })}

          {placed.map((node) => {
            const isSelf = hovered === node.id;
            const isPrereq = prerequisites.has(node.id);
            const isDependent = dependents.has(node.id);
            const onPath = !dimmed || isSelf || isPrereq || isDependent;

            const stroke = isSelf
              ? "#e7edf3"
              : isPrereq
                ? TEAL
                : isDependent
                  ? ORANGE
                  : node.color;

            return (
              <a
                key={node.id}
                href={`/topic/${node.id}`}
                aria-label={`${node.title}${node.position ? `, position ${node.position}` : ""}`}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(node.id)}
                onBlur={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <g opacity={onPath ? 1 : 0.12} style={{ transition: "opacity 120ms linear" }}>
                  <title>{node.title}</title>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={7}
                    fill={NODE_IDLE_FILL}
                    stroke={stroke}
                    strokeOpacity={isSelf || isPrereq || isDependent ? 0.95 : 0.34}
                    strokeWidth={isSelf || isPrereq || isDependent ? 1.6 : 1}
                  />
                  <rect x={node.x} y={node.y} width={3} height={NODE_H} rx={1.5} fill={node.color} />
                  <text
                    x={node.x + 11}
                    y={node.y + 18}
                    fill="#e7edf3"
                    fontSize={10.5}
                    fontFamily="ui-sans-serif, system-ui"
                  >
                    {truncate(node.title, 23)}
                  </text>
                  <text
                    x={node.x + 11}
                    y={node.y + 32}
                    fill="#626c7a"
                    fontSize={8.5}
                    fontFamily="ui-monospace, monospace"
                    letterSpacing={0.4}
                  >
                    {String(node.position).padStart(2, "0")}
                  </text>
                </g>
              </a>
            );
          })}
        </svg>
      </div>

      {/* Legend in words, not symbols explained by other symbols. */}
      <ul className="mt-3 grid gap-1.5 px-1 text-[11.5px] leading-relaxed text-ink-dimmer sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border" style={{ borderColor: TEAL }} />
          Teal outline — you need this one first.
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border" style={{ borderColor: ORANGE }} />
          Orange outline — this one unlocks next.
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-line-2 opacity-30" />
          Faint — not on the path you are pointing at.
        </li>
        <li className="flex items-center gap-2">
          <span className="h-px w-5 shrink-0 bg-ink-dimmer" />
          Arrows point from a topic to the thing it unlocks.
        </li>
      </ul>
    </div>
  );
}
