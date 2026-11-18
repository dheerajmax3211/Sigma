"use client";

import { evaluate, type Scope } from "@/lib/decks/expr";
import { fill, fmt, inline } from "@/lib/decks/text";
import type { ViewT } from "@/lib/decks/schema";
import { Chain } from "./Chain";

type V<T extends ViewT["type"]> = Extract<ViewT, { type: T }>;

function Vectors({ v, scope }: { v: V<"vectors">; scope: Scope }) {
  const W = 360, H = 300, cx = W / 2, cy = H / 2, k = (H / 2 - 18) / v.range;
  const px = (x: number) => cx + x * k, py = (y: number) => cy - y * k;
  const ticks = Array.from({ length: 2 * v.range + 1 }, (_, i) => i - v.range);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[460px]" role="img" aria-label="Arrows drawn from the origin on a grid">
      {ticks.map((t) => (
        <g key={t} stroke={t === 0 ? "#64748b" : "#1e293b"} strokeWidth={t === 0 ? 1.5 : 1}>
          <line x1={px(t)} y1={py(-v.range)} x2={px(t)} y2={py(v.range)} /><line x1={px(-v.range)} y1={py(t)} x2={px(v.range)} y2={py(t)} />
        </g>
      ))}
      {v.xLabel && <text x={W - 6} y={cy - 6} textAnchor="end" fill="#64748b" fontSize={11}>{v.xLabel}</text>}
      {v.yLabel && <text x={cx + 6} y={14} fill="#64748b" fontSize={11}>{v.yLabel}</text>}
      {v.arrows.map((a, i) => {
        const x = evaluate(a.x, scope), y = evaluate(a.y, scope), len = Math.hypot(x, y) || 1, ux = x / len, uy = y / len;
        const tx = px(x), ty = py(y), hx = (s: number) => tx - ux * 10 + (-uy) * s * 5, hy = (s: number) => ty + uy * 10 + (-ux) * s * 5;
        return (
          <g key={i} stroke={a.color} fill={a.color}>
            <line x1={cx} y1={cy} x2={tx - ux * 8} y2={ty + uy * 8} strokeWidth={3} strokeLinecap="round" />
            <polygon points={`${tx},${ty} ${hx(1)},${hy(1)} ${hx(-1)},${hy(-1)}`} stroke="none" />
            <text x={tx + (ux >= 0 ? 8 : -8)} y={ty - 8} textAnchor={ux >= 0 ? "start" : "end"} fontSize={13} fontWeight={700} stroke="none">{a.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Curve({ v, scope }: { v: V<"curve">; scope: Scope }) {
  const W = 560, H = 230, m = 34;
  const f = (t: number) => evaluate(v.fn, { ...scope, t });
  const pts = Array.from({ length: 81 }, (_, i) => { const t = v.min + ((v.max - v.min) * i) / 80; return [t, f(t)] as const; });
  const ys = pts.map((p) => p[1]), lo = v.yMin ?? Math.min(...ys), hi = v.yMax ?? Math.max(...ys);
  const X = (t: number) => m + ((t - v.min) / (v.max - v.min)) * (W - 2 * m);
  // Fixed y-range (yMin/yMax) keeps a line's steepness honest; values outside are clipped to the frame.
  const Y = (y: number) => Math.min(H - m / 2, Math.max(m / 2, H - m - ((y - lo) / (hi - lo || 1)) * (H - 2 * m)));
  const t0 = Math.min(v.max, Math.max(v.min, evaluate(v.point, scope))), y0 = f(t0);
  const sl = v.slope ? evaluate(v.slope, scope) : null, d = (v.max - v.min) * 0.14;
  const clamp = (y: number) => Math.min(H, Math.max(0, y));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Curve of ${v.yLabel} against ${v.xLabel}`}>
      <line x1={m} y1={H - m} x2={W - m} y2={H - m} stroke="#475569" /><line x1={m} y1={m / 2} x2={m} y2={H - m} stroke="#475569" />
      <text x={W - m} y={H - 8} textAnchor="end" fill="#64748b" fontSize={12}>{v.xLabel}</text><text x={m + 6} y={16} fill="#64748b" fontSize={12}>{v.yLabel}</text>
      <polyline fill="none" stroke="#38bdf8" strokeWidth={3} points={pts.map(([t, y]) => `${X(t)},${Y(y)}`).join(" ")} />
      {sl !== null && <line x1={X(t0 - d)} y1={clamp(Y(y0 - sl * d))} x2={X(t0 + d)} y2={clamp(Y(y0 + sl * d))} stroke="#f97316" strokeWidth={3} strokeLinecap="round" />}
      <circle cx={X(t0)} cy={Y(y0)} r={8} fill="#1cd6ac" stroke="#0b0f16" strokeWidth={3} />
      {sl !== null && <text x={X(t0)} y={Y(y0) - 16} textAnchor="middle" fill="#fb923c" fontSize={13} fontWeight={700}>slope {fmt(sl)}</text>}
    </svg>
  );
}

function Bars({ v, scope }: { v: V<"bars">; scope: Scope }) {
  const vals = v.items.map((b) => evaluate(b.value, scope));
  const max = v.max ?? Math.max(1e-9, ...vals.map(Math.abs)), neg = vals.some((x) => x < 0);
  return (
    <ul className="space-y-2" role="img" aria-label="Bar chart">
      {v.items.map((b, i) => {
        const on = b.on ? evaluate(b.on, scope) > 0 : true, pct = (Math.abs(vals[i]) / max) * (neg ? 50 : 100);
        return (
          <li key={i} className="flex items-center gap-3 text-[14px]" style={{ opacity: on ? 1 : 0.35 }}>
            <span className="w-28 shrink-0 text-fg">{b.label}</span>
            <span className="relative h-5 flex-1 rounded bg-surface-3">
              <span className="absolute top-0 h-5 rounded" style={{ background: b.color, width: `${pct}%`, left: neg ? (vals[i] < 0 ? `${50 - pct}%` : "50%") : 0, transition: "all .2s" }} />
            </span>
            <span className="w-14 text-right font-mono text-brand">{fmt(vals[i])}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Flow({ v, scope }: { v: V<"flow">; scope: Scope }) {
  return (
    <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
      {v.stages.map((s, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2 md:flex-row">
          <div className="w-full flex-1 rounded-xl border-2 bg-surface-2 p-3 text-center" style={{ borderColor: s.color }}>
            <div className="text-[13px] font-bold text-fg">{s.label}</div>
            <div className="mt-1 text-[12.5px] leading-snug text-ink-dim" dangerouslySetInnerHTML={{ __html: inline(fill(s.note, scope)) }} />
          </div>
          {i < v.stages.length - 1 && <span className="animate-pulse text-xl text-brand" style={{ animationDelay: `${i * 0.25}s` }}>→</span>}
        </div>
      ))}
    </div>
  );
}

const Note = ({ s, scope }: { s?: string; scope: Scope }) => s ? <p className="mt-2 text-center font-mono text-[13px] text-brand" dangerouslySetInnerHTML={{ __html: inline(fill(s, scope)) }} /> : null;
const idx = (e: string, scope: Scope) => Math.round(evaluate(e, scope));

function ArrayV({ v, scope }: { v: V<"array">; scope: Scope }) {
  const cells = v.frames && v.frame ? v.frames[Math.min(v.frames.length - 1, Math.max(0, idx(v.frame, scope)))] : v.cells;
  const n = cells.length;
  const inW = (i: number) => v.windows.find((w) => i >= idx(w.from, scope) && i <= idx(w.to, scope));
  return (
    <div role="img" aria-label="Array with pointers">
      <div className="flex justify-center gap-1 overflow-x-auto pb-1">
        {cells.map((c, i) => {
          const w = inW(i);
          return (
            <div key={i} className="flex flex-col items-center">
              <div className="grid h-11 min-w-11 place-items-center rounded-lg border px-1 font-mono text-[15px] text-fg" style={{ borderColor: w ? w.color : "#334155", background: w ? `${w.color}33` : "#111827", transition: "all .2s" }}>{c}</div>
              <span className="font-mono text-[10px] text-ink-dimmer">{i}</span>
              {v.pointers.filter((p) => idx(p.at, scope) === i).map((p, k) => (
                <span key={k} className="text-center font-mono text-[11px] font-bold leading-tight" style={{ color: p.color }}>▲<br />{p.label}</span>
              ))}
            </div>
          );
        })}
      </div>
      {n > 12 && <p className="text-center text-[11px] text-ink-dimmer">scroll sideways</p>}
      <Note s={v.note} scope={scope} />
    </div>
  );
}

function TreeV({ v, scope }: { v: V<"tree">; scope: Scope }) {
  const W = 420, rowH = 56, levels = Math.floor(Math.log2(v.values.length)) + 1, H = levels * rowH + 10;
  const seen = v.order.slice(0, Math.max(0, idx(v.step, scope))), cur = seen[seen.length - 1];
  const pos = (i: number) => { const lv = Math.floor(Math.log2(i + 1)), k = i + 1 - 2 ** lv; return { x: ((k + 0.5) / 2 ** lv) * W, y: lv * rowH + 26 }; };
  const live = (i: number) => i < v.values.length && v.values[i] !== null;
  return (
    <div role="img" aria-label="Binary tree">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[460px]">
        {v.values.map((_, i) => [2 * i + 1, 2 * i + 2].filter((c) => live(i) && live(c)).map((c) => {
          const a = pos(i), b = pos(c);
          return <line key={`${i}-${c}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={seen.includes(c) ? "#1cd6ac" : "#334155"} strokeWidth={2} />;
        }))}
        {v.values.map((val, i) => {
          if (val === null) return null;
          const p = pos(i), k = seen.indexOf(i);
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={19} fill={i === cur ? "#f97316" : k >= 0 ? "#1cd6ac" : "#111827"} stroke={k >= 0 ? "#0b0f16" : "#475569"} strokeWidth={2} />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={k >= 0 ? "#0b0f16" : "#e5e7eb"}>{val}</text>
              {k >= 0 && <text x={p.x + 19} y={p.y - 14} fontSize={11} fill="#94a3b8">{k + 1}</text>}
            </g>
          );
        })}
      </svg>
      <Note s={v.note} scope={scope} />
    </div>
  );
}

function GraphV({ v, scope }: { v: V<"graph">; scope: Scope }) {
  const W = 440, H = 300, P = 30, seen = v.order.slice(0, Math.max(0, idx(v.step, scope)));
  const at = (id: string) => { const n = v.nodes.find((x) => x.id === id)!; return { x: P + (n.x / 100) * (W - 2 * P), y: P + (n.y / 100) * (H - 2 * P) }; };
  const reached = (a: string, b: string) => seen.some((o) => (o.node === b && o.from === a) || (!v.directed && o.node === a && o.from === b));
  const cur = seen[seen.length - 1]?.node;
  return (
    <div role="img" aria-label="Graph">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[480px]">
        <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b" /></marker></defs>
        {v.edges.map((e, i) => {
          const a = at(e.a), b = at(e.b), hot = reached(e.a, e.b), d = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
          return (
            <g key={i}>
              <line x1={a.x + ux * 18} y1={a.y + uy * 18} x2={b.x - ux * (v.directed ? 22 : 18)} y2={b.y - uy * (v.directed ? 22 : 18)} stroke={hot ? "#1cd6ac" : "#475569"} strokeWidth={hot ? 3 : 2} markerEnd={v.directed ? "url(#ah)" : undefined} />
              {e.w !== undefined && <text x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2 - 6} fontSize={12} fill="#fbbf24">{e.w}</text>}
            </g>
          );
        })}
        {v.nodes.map((n) => {
          const p = at(n.id), k = seen.findIndex((o) => o.node === n.id), lab = k >= 0 ? seen[k].label : undefined;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={17} fill={n.id === cur ? "#f97316" : k >= 0 ? "#1cd6ac" : "#111827"} stroke={k >= 0 ? "#0b0f16" : "#475569"} strokeWidth={2} />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={k >= 0 ? "#0b0f16" : "#e5e7eb"}>{n.id}</text>
              {lab !== undefined && <text x={p.x} y={p.y + 34} textAnchor="middle" fontSize={12} fill="#38bdf8">{lab}</text>}
            </g>
          );
        })}
      </svg>
      <Note s={v.note} scope={scope} />
    </div>
  );
}

function GridV({ v, scope }: { v: V<"grid">; scope: Scope }) {
  const cols = v.rows[0].length, shown = Math.max(0, idx(v.fill, scope));
  return (
    <div role="img" aria-label="Table that fills in" className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-1 font-mono text-[14px]">
        {v.colLabels && <thead><tr>{v.rowLabels && <th />}{v.colLabels.map((c, j) => <th key={j} className="px-2 text-[12px] font-normal text-ink-dimmer">{c}</th>)}</tr></thead>}
        <tbody>
          {v.rows.map((r, i) => (
            <tr key={i}>
              {v.rowLabels && <th className="pr-2 text-right text-[12px] font-normal text-ink-dimmer">{v.rowLabels[i]}</th>}
              {r.map((c, j) => {
                const k = i * cols + j;
                return <td key={j} className="h-10 min-w-10 rounded-md border px-2 text-center text-fg" style={{ borderColor: k === shown - 1 ? "#f97316" : "#334155", background: k === shown - 1 ? "#f9731633" : k < shown ? "#1cd6ac22" : "#111827", transition: "all .2s" }}>{k < shown ? c : ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Note s={v.note} scope={scope} />
    </div>
  );
}

export function View({ view, scope, blame = "none" }: { view: ViewT; scope: Scope; blame?: number | "all" | "none" }) {
  switch (view.type) {
    case "chain": return <Chain view={view} scope={scope} blame={blame} />;
    case "vectors": return <Vectors v={view} scope={scope} />;
    case "curve": return <Curve v={view} scope={scope} />;
    case "bars": return <Bars v={view} scope={scope} />;
    case "flow": return <Flow v={view} scope={scope} />;
    case "array": return <ArrayV v={view} scope={scope} />;
    case "tree": return <TreeV v={view} scope={scope} />;
    case "graph": return <GraphV v={view} scope={scope} />;
    case "grid": return <GridV v={view} scope={scope} />;
  }
}
