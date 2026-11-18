"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InlineMath } from "@/components/CodeEditor";

/* ══════════════════════════════════════════════════════════════════════════
   3-D LOSS SURFACE
   ══════════════════════════════════════════════════════════════════════════ */

type Pt3 = [number, number, number];

/**
 * Loss surface with a real gradient-descent trajectory.
 *
 * The surface is evaluated numerically, the descent is integrated with the
 * actual update rule, and the projection is a plain rotation matrix — so what
 * you drag is the same mathematics the lesson describes, not a picture of it.
 */
export function LossSurfaceView({ params }: { params: Record<string, unknown> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState(-0.62);
  const [pitch, setPitch] = useState(0.52);
  const [lr, setLr] = useState(Number(params.lr ?? 0.12));
  const [step, setStep] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const kappa = Math.max(1, Number(params.kappa ?? 12));
  // A quadratic with condition number kappa: curvature 1 and kappa.
  const f = useMemo(() => {
    const a = 1;
    const b = kappa;
    return (x: number, y: number) => 0.5 * (a * x * x + b * y * y);
  }, [kappa]);
  const grad = useMemo(() => {
    const a = 1;
    const b = kappa;
    return (x: number, y: number): [number, number] => [a * x, b * y];
  }, [kappa]);

  // Integrate the descent once per (lr, kappa).
  const path = useMemo(() => {
    const pts: { x: number; y: number; z: number }[] = [];
    let x = -2.4;
    let y = 1.55;
    for (let i = 0; i < 60; i++) {
      pts.push({ x, y, z: f(x, y) });
      const [gx, gy] = grad(x, y);
      x -= lr * gx;
      y -= lr * gy;
      if (!Number.isFinite(x) || !Number.isFinite(y)) break;
      if (Math.abs(x) > 40 || Math.abs(y) > 40) break;
    }
    return pts;
  }, [f, grad, lr]);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % Math.max(path.length, 1));
    }, 220);
    return () => clearInterval(id);
  }, [path.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.56;
    const scale = Math.min(w, h) * 0.19;

    // Height must be COMPRESSED, not linearly normalised.
    //
    // A quadratic with curvature kappa reaches f ~ 30 near the edges, so
    // dividing by the max maps the whole bowl into ~3% of the plot height and
    // it reads as a flat grid. A log compression keeps the bowl shape while
    // fitting the vertical budget.
    const zRaw = Math.max(...path.map((p) => p.z), f(2.0, 1.0)) || 1;
    const zTop = Math.log1p(zRaw) || 1;
    const zPlot = (x: number, y: number) => (Math.log1p(Math.max(f(x, y), 0)) / zTop) * 0.95;
    const zOf = (z: number) => (Math.log1p(Math.max(z, 0)) / zTop) * 0.95;

    const project = ([x, y, z]: Pt3): [number, number] => {
      // Rotate about the vertical axis, then tilt.
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const x1 = x * cyaw - y * syaw;
      const y1 = x * syaw + y * cyaw;
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const y2 = y1 * cp - z * sp;
      const z2 = y1 * sp + z * cp;
      // Gentle perspective.
      const persp = 1 / (1 + z2 * 0.06);
      return [cx + x1 * scale * persp, cy + y2 * scale * persp + z * 0];
    };

    const R = 2.6;
    const N = 22;

    // Surface wireframe, back to front.
    const lines: { pts: [number, number][]; depth: number; shade: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const t = -R + (2 * R * i) / N;
      const row: [number, number][] = [];
      let depth = 0;
      for (let j = 0; j <= N; j++) {
        const s = -R + (2 * R * j) / N;
        const zz = zPlot(t, s);
        const p = project([t, s, zz]);
        row.push(p);
        depth += p[1];
      }
      lines.push({ pts: row, depth: depth / (N + 1), shade: Math.abs(t) / R });
    }
    for (let j = 0; j <= N; j++) {
      const s = -R + (2 * R * j) / N;
      const col: [number, number][] = [];
      let depth = 0;
      for (let i = 0; i <= N; i++) {
        const t = -R + (2 * R * i) / N;
        const zz = zPlot(t, s);
        const p = project([t, s, zz]);
        col.push(p);
        depth += p[1];
      }
      lines.push({ pts: col, depth: depth / (N + 1), shade: Math.abs(s) / R });
    }
    lines.sort((a, b) => b.depth - a.depth);
    for (const line of lines) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(28,214,172,${0.10 + line.shade * 0.22})`;
      ctx.lineWidth = 1;
      line.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }

    // Descent trajectory.
    const traced = path.slice(0, Math.max(step, 1));
    ctx.beginPath();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    traced.forEach((p, i) => {
      const [x, y] = project([p.x, p.y, zOf(p.z)]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Current point.
    const head = traced[traced.length - 1];
    if (head) {
      const [hx, hy] = project([head.x, head.y, zOf(head.z)]);
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy, 10, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(249,115,22,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#d7dbe0";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(`f = ${head.z.toFixed(4)}`, hx + 12, hy - 8);
    }

    ctx.fillStyle = "#626c7a";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`κ = ${kappa.toFixed(0)}   lr = ${lr.toFixed(2)}   step ${step}`, 10, h - 10);
  }, [f, path, yaw, pitch, lr, step, kappa]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="h-[320px] w-full cursor-grab rounded-xl bg-surface-2 active:cursor-grabbing"
        onMouseDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setYaw((v) => v + dx * 0.008);
          setPitch((v) => Math.max(-1.2, Math.min(1.4, v + dy * 0.006)));
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex flex-1 items-center gap-2.5">
          <span className="font-mono text-[11px] text-ink-dimmer">learning rate</span>
          <input
            type="range"
            min="0.02"
            max="1.2"
            step="0.02"
            value={lr}
            onChange={(e) => setLr(Number(e.target.value))}
            className="h-1 flex-1 accent-brand"
          />
          <span className="w-10 font-mono text-[11px] text-brand">{lr.toFixed(2)}</span>
        </label>
        <span className="font-mono text-[10.5px] text-ink-dimmer">
          drag to orbit
        </span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
        Curvature ratio <InlineMath source={`$\\kappa = ${kappa}$`} /> makes the bowl a valley. With a
        fixed learning rate the long axis is under-stepped and the short axis is
        over-stepped, which is exactly the zig-zag you see — and why the largest
        stable step is <InlineMath source="$\\text{lr} < 2/\\lambda_{\\max}$" />.
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ATTENTION HEATMAP
   ══════════════════════════════════════════════════════════════════════════ */

const TOKENS = ["The", "cat", "sat", "on", "the", "mat"];

function softmax(row: number[]): number[] {
  const m = Math.max(...row);
  const e = row.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

/** Deterministic pseudo-random so the demo is reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Self-attention heatmap.
 *
 * Q, K and V are real matrices; the displayed weights are the actual
 * softmax(QKᵀ/√d) values, and the temperature slider changes √d so you can see
 * how scaling sharpens or flattens the distribution.
 */
export function AttentionView({ params }: { params: Record<string, unknown> }) {
  const dim = Math.min(Number(params.dim ?? 8), 16);
  const [head, setHead] = useState(0);
  const [show, setShow] = useState<"scores" | "weights">("weights");
  const [temp, setTemp] = useState(1);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const { scores, weights, q, k } = useMemo(() => {
    const rand = rng(1234 + head * 977);
    const n = TOKENS.length;
    // Content-aware-ish: make a token attend to itself and to "cat"/"mat".
    const qm = Array.from({ length: n }, () => Array.from({ length: dim }, () => rand() - 0.5));
    const km = Array.from({ length: n }, () => Array.from({ length: dim }, () => rand() - 0.5));
    // Bias so the picture is interpretable rather than noise.
    km[1][0] += 1.4;
    km[5][0] += 1.1;
    const sc = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        let s = 0;
        for (let d = 0; d < dim; d++) s += qm[i][d] * km[j][d];
        return s / Math.sqrt(dim) / temp;
      }),
    );
    return { scores: sc, weights: sc.map(softmax), q: qm, k: kmm(km) };
    function kmm(m: number[][]) {
      return m;
    }
  }, [dim, head, temp]);

  const n = TOKENS.length;
  const cell = 40;
  const left = 74;
  const top = 30;
  const w = left + n * cell + 12;
  const h = top + n * cell + 12;
  const grid = show === "weights" ? weights : scores;
  const flat = grid.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);

  const color = (v: number) => {
    const t = hi > lo ? (v - lo) / (hi - lo) : 0;
    // teal → orange ramp on the dark surface
    const r = Math.round(28 + t * (249 - 28));
    const g = Math.round(214 + t * (115 - 214));
    const b = Math.round(172 + t * (22 - 172));
    return `rgba(${r},${g},${b},${0.15 + t * 0.8})`;
  };

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {["weights", "scores"].map((m) => (
          <button
            key={m}
            onClick={() => setShow(m as "scores" | "weights")}
            className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
              show === m
                ? "border-brand/40 bg-brand/10 text-brand"
                : "border-line text-ink-dimmer hover:text-fg"
            }`}
          >
            {m}
          </button>
        ))}
        <span className="ml-1 font-mono text-[10.5px] text-ink-dimmer">head</span>
        {[0, 1, 2].map((hd) => (
          <button
            key={hd}
            onClick={() => setHead(hd)}
            className={`h-6 w-6 rounded-md border font-mono text-[10.5px] transition ${
              head === hd
                ? "border-brand/40 bg-brand/10 text-brand"
                : "border-line text-ink-dimmer hover:text-fg"
            }`}
          >
            {hd + 1}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-ink-dimmer">scale</span>
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.1"
            value={temp}
            onChange={(e) => setTemp(Number(e.target.value))}
            className="h-1 w-24 accent-brand"
          />
          <span className="w-8 font-mono text-[10.5px] text-brand">{temp.toFixed(1)}</span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <svg width={w} height={h} role="img" aria-label="Attention weights">
          {TOKENS.map((t, j) => (
            <text
              key={`c${j}`}
              x={left + j * cell + cell / 2}
              y={top - 9}
              textAnchor="middle"
              fontSize="10"
              fill={hover?.j === j ? "#1cd6ac" : "#626c7a"}
              fontFamily="ui-monospace, monospace"
            >
              {t}
            </text>
          ))}
          {TOKENS.map((t, i) => (
            <text
              key={`r${i}`}
              x={left - 8}
              y={top + i * cell + cell / 2 + 3.5}
              textAnchor="end"
              fontSize="10"
              fill={hover?.i === i ? "#1cd6ac" : "#626c7a"}
              fontFamily="ui-monospace, monospace"
            >
              {t}
            </text>
          ))}
          {grid.map((row, i) =>
            row.map((v, j) => {
              const active = hover?.i === i || hover?.j === j;
              return (
                <g key={`${i}-${j}`}>
                  <rect
                    x={left + j * cell}
                    y={top + i * cell}
                    width={cell - 2}
                    height={cell - 2}
                    rx="3"
                    fill={color(v)}
                    stroke={active ? "#ffffff" : "transparent"}
                    strokeWidth={active ? 1.2 : 0}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover({ i, j })}
                    onMouseLeave={() => setHover(null)}
                  />
                  <text
                    x={left + j * cell + (cell - 2) / 2}
                    y={top + i * cell + (cell - 2) / 2 + 3}
                    textAnchor="middle"
                    fontSize="8.5"
                    fill="#0b0e13"
                    fontFamily="ui-monospace, monospace"
                    fontWeight="600"
                    pointerEvents="none"
                  >
                    {show === "weights" ? v.toFixed(2) : v.toFixed(1)}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {hover && (
        <p className="mt-2 font-mono text-[11.5px] text-ink-dim">
          <span className="text-brand">{TOKENS[hover.i]}</span> attends to{" "}
          <span className="text-brand">{TOKENS[hover.j]}</span> with weight{" "}
          <span className="text-fg">{weights[hover.i][hover.j].toFixed(4)}</span> (score{" "}
          {scores[hover.i][hover.j].toFixed(3)})
        </p>
      )}
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
        Row <InlineMath source="$i$" /> is the query, column <InlineMath source="$j$" /> the key.
        Every row sums to 1. The scale slider changes the{" "}
        <InlineMath source="$\\sqrt{d}$" /> divisor: small scale sharpens attention toward one
        token, large scale flattens it toward uniform. Dimension is{" "}
        <InlineMath source={`$d = ${dim}$`} /> across {n} tokens, so the score matrix is{" "}
        <InlineMath source={`$${n} \\times ${n}$`} />.
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TENSOR SHAPE FLOW
   ══════════════════════════════════════════════════════════════════════════ */

type ShapeStep = {
  name: string;
  shape: number[];
  op: string;
  note: string;
};

/** Shape algebra through a transformer block, with the parameter count. */
export function TensorView({ params }: { params: Record<string, unknown> }) {
  const d = Number(params.d ?? 768);
  const heads = Number(params.heads ?? 12);
  const seq = Number(params.seq ?? 128);
  const ffn = Number(params.ffn ?? 3072);
  const [idx, setIdx] = useState(1);

  const steps: ShapeStep[] = useMemo(
    () => [
      {
        name: "tokens",
        shape: [seq],
        op: "tokenise",
        note: `A batch of ${seq} token ids. No float math yet — this is just integers.`,
      },
      {
        name: "embedding",
        shape: [seq, d],
        op: "Embedding(V, d)",
        note: `Lookup table of ${d} floats per token. Parameters here: vocab × ${d}.`,
      },
      {
        name: "Q, K, V",
        shape: [seq, d],
        op: `Linear(d, ${d}) × 3`,
        note: `Three separate projections of the same input. Parameters: 3 × ${d}² = ${(3 * d * d).toLocaleString()}.`,
      },
      {
        name: "per-head",
        shape: [heads, seq, d / heads],
        op: `reshape + transpose`,
        note: `Split the ${d} channels into ${heads} heads of ${d / heads}. Same numbers, different layout — this is free.`,
      },
      {
        name: "scores",
        shape: [heads, seq, seq],
        op: `QKᵀ / √${d / heads}`,
        note: `Attention cost lives here: ${heads} × ${seq} × ${seq} = ${(heads * seq * seq).toLocaleString()} scores. This is the term that scales as O(n²).`,
      },
      {
        name: "context",
        shape: [heads, seq, d / heads],
        op: "softmax · V",
        note: `Weighted sum of values. Back to the per-head width.`,
      },
      {
        name: "merged",
        shape: [seq, d],
        op: "concat + Linear(d, d)",
        note: `Heads concatenated and projected back. Parameters: ${(d * d).toLocaleString()}.`,
      },
      {
        name: "FFN",
        shape: [seq, ffn],
        op: `Linear(d, ${ffn}) → GELU`,
        note: `Expand by 4×, then contract. Parameters: ${(2 * d * ffn).toLocaleString()}, which is two thirds of the block.`,
      },
      {
        name: "out",
        shape: [seq, d],
        op: `Linear(${ffn}, d)`,
        note: `Back to ${d}. Block output has the same shape as its input, which is what makes residual stacking possible.`,
      },
    ],
    [d, heads, seq, ffn],
  );

  const cur = steps[idx];
  const params_ = 4 * d * d + 2 * d * ffn;

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {steps.map((s, i) => {
          const active = i === idx;
          return (
            <button
              key={s.name}
              onClick={() => setIdx(i)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? "border-brand/40 bg-brand/[0.07]"
                  : "border-line bg-surface-2 hover:border-line-2"
              }`}
            >
              <span
                className={`w-[74px] shrink-0 font-mono text-[11px] ${
                  active ? "text-brand" : "text-ink-dimmer"
                }`}
              >
                {s.name}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {s.shape.map((v, k) => (
                  <span key={k} className="flex items-center gap-1">
                    {k > 0 && <span className="font-mono text-[10px] text-ink-dimmer">×</span>}
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                        active ? "bg-brand/20 text-brand" : "bg-surface-4 text-ink-dim"
                      }`}
                    >
                      {Number.isInteger(v) ? v : v.toFixed(1)}
                    </span>
                  </span>
                ))}
              </span>
              <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-ink-dimmer sm:block">
                {s.op}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-dim">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-brand">
          {cur.name}
        </span>{" "}
        — {cur.note}
      </p>
      <p className="mt-2 font-mono text-[10.5px] text-ink-dimmer">
        block parameters ≈ {params_.toLocaleString()} for d={d}, ffn={ffn}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPUTATION GRAPH
   ══════════════════════════════════════════════════════════════════════════ */

type GNode = { id: string; label: string; x: number; y: number; op: string };

/** Forward/backward graph for a tiny expression, with local gradients. */
export function ComputationGraphView({ params }: { params: Record<string, unknown> }) {
  const [backward, setBackward] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const nodes: GNode[] = [
    { id: "a", label: "a = 2.0", x: 0, y: 1, op: "leaf" },
    { id: "b", label: "b = -3.0", x: 0, y: 2, op: "leaf" },
    { id: "c", label: "c = 10.0", x: 0, y: 0, op: "leaf" },
    { id: "m", label: "e = a·b", x: 1, y: 1.5, op: "mul" },
    { id: "s", label: "d = e + c", x: 2, y: 0.75, op: "add" },
    { id: "t", label: "L = tanh(d)", x: 3, y: 0.75, op: "tanh" },
  ];
  const edges = [
    { from: "a", to: "m" },
    { from: "b", to: "m" },
    { from: "m", to: "s" },
    { from: "c", to: "s" },
    { from: "s", to: "t" },
  ];

  // Values and local derivatives, computed exactly.
  const a = 2.0;
  const b = -3.0;
  const c = 10.0;
  const e = a * b;
  const d = e + c;
  const L = Math.tanh(d);
  const dL_dd = 1 - L * L;
  const grads: Record<string, { val: number; grad: number; local: string }> = {
    a: { val: a, grad: dL_dd * b, local: "∂e/∂a = b" },
    b: { val: b, grad: dL_dd * a, local: "∂e/∂b = a" },
    c: { val: c, grad: dL_dd, local: "∂d/∂c = 1" },
    m: { val: e, grad: dL_dd, local: "∂d/∂e = 1" },
    s: { val: d, grad: dL_dd, local: "∂L/∂d = 1 − tanh²(d)" },
    t: { val: L, grad: 1, local: "output" },
  };

  const W = 560;
  const H = 240;
  const CW = 118;
  const CH = 40;
  const px = (x: number) => 16 + x * 170;
  const py = (y: number) => 22 + y * 88;

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <button
          onClick={() => setBackward((v) => !v)}
          className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
            backward
              ? "border-brand-orange/40 bg-brand-orange/10 text-brand-orange"
              : "border-brand/40 bg-brand/10 text-brand"
          }`}
        >
          {backward ? "backward" : "forward"}
        </button>
        <span className="font-mono text-[10.5px] text-ink-dimmer">
          {backward ? "∂L/∂· shown" : "values shown"}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-dimmer">L = {L.toFixed(4)}</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Computation graph">
          <defs>
            <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={backward ? "#f97316" : "#1cd6ac"} />
            </marker>
          </defs>
          {edges.map((e2, i) => {
            const from = nodes.find((n) => n.id === e2.from)!;
            const to = nodes.find((n) => n.id === e2.to)!;
            const x1 = px(from.x) + CW;
            const y1 = py(from.y) + CH / 2;
            const x2 = px(to.x);
            const y2 = py(to.y) + CH / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={backward
                  ? `M ${x2} ${y2} C ${mid} ${y2}, ${mid} ${y1}, ${x1 + 6} ${y1}`
                  : `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 6} ${y2}`}
                fill="none"
                stroke={backward ? "#f97316" : "#ffffff26"}
                strokeWidth="1.6"
                markerEnd="url(#cg-arrow)"
                opacity="0.85"
              />
            );
          })}
          {nodes.map((n) => {
            const g = grads[n.id];
            const on = sel === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${px(n.x)},${py(n.y)})`}
                className="cursor-pointer"
                onClick={() => setSel((p) => (p === n.id ? null : n.id))}
              >
                <rect
                  width={CW}
                  height={CH}
                  rx="8"
                  fill="#10141b"
                  stroke={on ? "#1cd6ac" : "#ffffff26"}
                  strokeWidth={on ? 2 : 1}
                />
                <text x="10" y="17" fontSize="10.5" fill="#d7dbe0" fontFamily="ui-monospace, monospace">
                  {n.label}
                </text>
                <text x="10" y="31" fontSize="9.5" fill={backward ? "#f97316" : "#626c7a"} fontFamily="ui-monospace, monospace">
                  {backward ? `∂L/∂ = ${g.grad.toFixed(3)}` : `= ${g.val.toFixed(3)}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {sel && (
        <p className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[11px] text-ink-dim">
          {sel}: local derivative {grads[sel].local} → gradient contribution{" "}
          <span className="text-brand-orange">{grads[sel].grad.toFixed(4)}</span>
        </p>
      )}
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
        Forward evaluates left to right. Backward applies the chain rule right to
        left, multiplying each node&apos;s incoming gradient by its local
        derivative. <InlineMath source="$\\partial e/\\partial a = b$" /> is why
        the gradient with respect to an input scales with the{" "}
        <em>other</em> input.
      </p>
    </div>
  );
}
