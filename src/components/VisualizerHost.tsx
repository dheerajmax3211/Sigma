"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InlineMath } from "@/components/CodeEditor";
import {
  AttentionView,
  ComputationGraphView,
  LossSurfaceView,
  TensorView,
} from "@/components/visualizers/Interactive";
import {
  dot,
  eckartYoungResidual,
  gaussian,
  jacobiEigen,
  matVec,
  mulberry32,
  norm,
  scale,
  svd,
  type Mat,
} from "@/lib/viz/linalg";

/**
 * Interactive visualizers.
 *
 * All three are canvas-based and recompute locally on every interaction, so
 * dragging a slider is instantaneous. Colours come from the app's own
 * tokens: teal for the primary quantity, orange for the comparison, violet
 * and sky for secondary series. Nothing is chart-junk — axes are labelled
 * directly and the values are printed, so there is no need for a legend.
 */

const C = {
  bg: "#0b0e13",
  // Grid and axes need enough contrast to read against the surface. At 7%
  // white the grid was effectively invisible.
  grid: "#ffffff1f",
  axis: "#ffffff47",
  fg: "#d7dbe0",
  dim: "#626c7a",
  brand: "#1cd6ac",
  orange: "#f97316",
  violet: "#a78bfa",
  sky: "#38bdf8",
  pink: "#f472b6",
};

const RENDERABLE = new Set([
  "loss_surface",
  "attention",
  "tensor",
  "shape_flow",
  "computation_graph",
]);
const LEGACY_IDS = new Set(["vs-eigen", "vs-pca-projection", "vs-svd-spectrum"]);

export function VisualizerHost({
  visualizer,
}: {
  visualizer: { id: string; kind: string; title: string; description?: string; params: Record<string, unknown> };
}) {
  return (
    <figure className="rounded-2xl border border-line bg-surface-1 p-4">
      <figcaption className="mb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-sm bg-brand shadow-[0_0_8px_rgba(28,214,172,0.6)]" />
          <h4 className="text-[14px] font-semibold text-fg">{visualizer.title}</h4>
        </div>
        {visualizer.description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
            <InlineMath source={visualizer.description} />
          </p>
        )}
      </figcaption>

      {/*
        Dispatch on `kind`, not on a hard-coded id list. Keying on ids meant
        every new visualizer rendered "declared but not yet implemented" until
        somebody edited this file — a content change should never require a
        code change.
      */}
      {visualizer.kind === "loss_surface" && <LossSurfaceView params={visualizer.params} />}
      {visualizer.kind === "attention" && <AttentionView params={visualizer.params} />}
      {visualizer.kind === "tensor" && <TensorView params={visualizer.params} />}
      {visualizer.kind === "shape_flow" && <TensorView params={visualizer.params} />}
      {visualizer.kind === "computation_graph" && (
        <ComputationGraphView params={visualizer.params} />
      )}
      {/* Legacy ids kept so existing content keeps working. */}
      {visualizer.id === "vs-eigen" && <EigenView params={visualizer.params} />}
      {visualizer.id === "vs-pca-projection" && <PcaView params={visualizer.params} />}
      {visualizer.id === "vs-svd-spectrum" && <SvdSpectrumView params={visualizer.params} />}
      {!RENDERABLE.has(visualizer.kind) && !LEGACY_IDS.has(visualizer.id) && (
        <p className="py-6 text-center font-mono text-[12px] text-ink-dimmer">
          Visualizer kind &ldquo;{visualizer.kind}&rdquo; has no renderer yet.
        </p>
      )}
    </figure>
  );
}

// ── 1. Eigenvector action ──────────────────────────────────────────────────

function EigenView({ params }: { params: Record<string, unknown> }) {
  const matrix = (params.matrix as number[][]) ?? [
    [2, 1],
    [1, 2],
  ];
  const [theta, setTheta] = useState(0.6);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const eigen = useMemo(() => jacobiEigen(matrix), [matrix]);
  const vec = [Math.cos(theta), Math.sin(theta)];
  const transformed = matVec(matrix, vec);

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
    ctx.clearRect(0, 0, w, h);
    // Paint the plot background into the canvas itself rather than relying on
    // a CSS background, so the canvas is self-contained (and extractable as a
    // standalone image).
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    // Fit the view to the data.
    //
    // A fixed scale overflows the canvas as soon as the matrix has a large
    // eigenvalue: |Av| can be 3x |v|, so the arrow runs off the top edge and
    // takes its label with it. Scale by the largest vector actually present,
    // with a margin, so nothing is ever clipped.
    const maxLen = Math.max(norm(vec), norm(transformed), 1e-9);
    const fit = (Math.min(w, h) * 0.5 - 46) / maxLen;
    const s = Math.min(fit, Math.min(w, h) * 0.34);

    const toPx = ([x, y]: number[]): [number, number] => [cx + x * s, cy - y * s];

    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    const step = 0.5;
    for (let i = -5; i <= 5; i++) {
      const t = i * step;
      ctx.beginPath();
      ctx.moveTo(...toPx([t, -2.6]));
      ctx.lineTo(...toPx([t, 2.6]));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(...toPx([-2.6, t]));
      ctx.lineTo(...toPx([2.6, t]));
      ctx.stroke();
    }
    // Axes
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(...toPx([-2.6, 0]));
    ctx.lineTo(...toPx([2.6, 0]));
    ctx.moveTo(...toPx([0, -2.6]));
    ctx.lineTo(...toPx([0, 2.6]));
    ctx.stroke();

    const arrow = (from: number[], to: number[], color: string, width = 2.5) => {
      const [x1, y1] = toPx(from);
      const [x2, y2] = toPx(to);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const a = Math.atan2(y2 - y1, x2 - x1);
      const hs = 9;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hs * Math.cos(a - 0.4), y2 - hs * Math.sin(a - 0.4));
      ctx.lineTo(x2 - hs * Math.cos(a + 0.4), y2 - hs * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
    };

    // Eigenvector directions (eigenbasis).
    eigen.vectors.forEach((v, i) => {
      const lambda = eigen.values[i];
      const color = i === 0 ? C.violet : C.sky;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      // Extend the eigenline past the plotted vectors, but stay in bounds.
      const reach = Math.min(2.6, (maxLen * 1.25) / Math.max(norm(v), 1e-9));
      const [x1, y1] = toPx(scale(v, -reach));
      const [x2, y2] = toPx(scale(v, reach));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = color;
      ctx.font = "11px ui-monospace, monospace";
      const sign = lambda >= 0 ? 1 : -1;
      ctx.fillText(`λ=${lambda.toFixed(2)}`, x2 + 6 * sign, y2 - 4);
    });

    // The vector and its image.
    arrow([0, 0], vec, C.brand, 2.5);
    arrow([0, 0], transformed, C.orange, 2.5);

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = C.brand;
    const [bx, by] = toPx(vec);
    ctx.fillText("v", bx + 7, by - 6);
    ctx.fillStyle = C.orange;
    const [ox, oy] = toPx(transformed);
    // Keep the label inside the canvas even when the arrow points at an edge.
    const lx = Math.min(Math.max(ox + 7, 6), w - 26);
    const ly = Math.min(Math.max(oy - 8, 14), h - 6);
    ctx.fillText("Av", lx, ly);
  }, [matrix, eigen, vec, transformed]);

  const stretch = norm(transformed) / Math.max(norm(vec), 1e-9);
  const isEigen = eigen.vectors.some((v) => Math.abs(Math.abs(dot(v, vec)) - 1) < 1e-6);

  return (
    <div className="flex flex-col gap-3">
      <canvas ref={canvasRef} className="h-[300px] w-full rounded-xl bg-surface-2" />
      <label className="flex items-center gap-3">
        <span className="w-24 shrink-0 font-mono text-[11px] text-ink-dim">direction θ</span>
        <input
          type="range"
          min={0}
          max={6.283}
          step={0.01}
          value={theta}
          onChange={(e) => setTheta(Number(e.target.value))}
          className="flex-1 accent-[#1cd6ac]"
        />
        <span className="w-16 shrink-0 text-right font-mono text-[11px] text-ink-dim">
          {((theta * 180) / Math.PI).toFixed(0)}°
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11.5px]">
        <span className="text-ink-dim">
          ‖Av‖/‖v‖ = <span className="font-bold text-brand">{stretch.toFixed(3)}</span>
        </span>
        {isEigen ? (
          <span className="rounded border border-brand/30 bg-brand/10 px-2 py-0.5 text-brand">
            v is an eigenvector — A does not rotate it
          </span>
        ) : (
          <span className="text-ink-dimmer">v is not an eigenvector — A rotates it</span>
        )}
      </div>
    </div>
  );
}

// ── 2. PCA projection ───────────────────────────────────────────────────────

function PcaView({ params }: { params: Record<string, unknown> }) {
  const seed = (params.seed as number) ?? 7;
  const n = (params.n as number) ?? 200;

  const data = useMemo(() => {
    const rng = mulberry32(seed);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const t = gaussian(rng) * 1.6;
      const noise = gaussian(rng) * 0.45;
      // Correlated cloud along a fixed direction, so the first PC is meaningful.
      pts.push([t * 0.98 + noise * 0.2, t * 0.6 + noise]);
    }
    return pts;
  }, [seed, n]);

  const { components, mean, ratios, variances } = useMemo(() => {
    const mx = data.reduce((s, p) => s + p[0], 0) / data.length;
    const my = data.reduce((s, p) => s + p[1], 0) / data.length;
    const centered: [number, number][] = data.map(([x, y]) => [x - mx, y - my]);
    const cxx = centered.reduce((s, p) => s + p[0] * p[0], 0) / (n - 1);
    const cyy = centered.reduce((s, p) => s + p[1] * p[1], 0) / (n - 1);
    const cxy = centered.reduce((s, p) => s + p[0] * p[1], 0) / (n - 1);
    const cov: Mat = [
      [cxx, cxy],
      [cxy, cyy],
    ];
    const e = jacobiEigen(cov);
    const total = e.values[0] + e.values[1];
    return {
      components: e.vectors,
      mean: [mx, my],
      variances: e.values,
      ratios: total > 0 ? [e.values[0] / total, e.values[1] / total] : [0, 0],
    };
  }, [data, n]);

  const [angle, setAngle] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const s = Math.min(w, h) * 0.36;
    const toPx = ([x, y]: number[]): [number, number] => [cx + x * s, cy - y * s];

    // Axes
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(...toPx([-3, 0]));
    ctx.lineTo(...toPx([3, 0]));
    ctx.moveTo(...toPx([0, -3]));
    ctx.lineTo(...toPx([0, 3]));
    ctx.stroke();

    // Points
    for (const [x, y] of data) {
      const [px, py] = toPx([x, y]);
      ctx.fillStyle = C.sky;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Projection axis (user-controlled angle).
    const dir = [Math.cos(angle), Math.sin(angle)];
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 2.5;
    const [ax, ay] = toPx(scale(dir, -3));
    const [bx, by] = toPx(scale(dir, 3));
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Projected points onto the axis.
    for (const [x, y] of data) {
      const t = x * dir[0] + y * dir[1];
      const [px, py] = toPx([dir[0] * t, dir[1] * t]);
      ctx.fillStyle = C.orange;
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.arc(px, py, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // True first principal direction.
    const pc1 = components[0];
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = C.brand;
    ctx.lineWidth = 2;
    const [p1x, p1y] = toPx(scale(pc1, -3));
    const [p2x, p2y] = toPx(scale(pc1, 3));
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = C.brand;
    const [lx, ly] = toPx(scale(pc1, 2.7));
    ctx.fillText("PC1", lx + 4, ly);
    ctx.fillStyle = C.orange;
    ctx.fillText("your axis", bx + 4, by);
  }, [data, components, angle]);

  // Variance captured by the chosen axis.
  const vxx = data.reduce((s, p) => s + (p[0] - mean[0]) ** 2, 0) / (n - 1);
  const vyy = data.reduce((s, p) => s + (p[1] - mean[1]) ** 2, 0) / (n - 1);
  const vxy = data.reduce((s, p) => s + (p[0] - mean[0]) * (p[1] - mean[1]), 0) / (n - 1);
  const dir = [Math.cos(angle), Math.sin(angle)];
  const captured = dir[0] * dir[0] * vxx + 2 * dir[0] * dir[1] * vxy + dir[1] * dir[1] * vyy;
  const totalVar = vxx + vyy;
  const capturedRatio = totalVar > 0 ? captured / totalVar : 0;

  const pc1Angle = Math.atan2(components[0][1], components[0][0]);

  return (
    <div className="flex flex-col gap-3">
      <canvas ref={canvasRef} className="h-[300px] w-full rounded-xl bg-surface-2" />
      <label className="flex items-center gap-3">
        <span className="w-24 shrink-0 font-mono text-[11px] text-ink-dim">your axis</span>
        <input
          type="range"
          min={0}
          max={6.283}
          step={0.005}
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value))}
          className="flex-1 accent-[#f97316]"
        />
        <span className="w-16 shrink-0 text-right font-mono text-[11px] text-ink-dim">
          {((angle * 180) / Math.PI).toFixed(0)}°
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11.5px]">
        <span className="text-ink-dim">
          captured ={" "}
          <span className="font-bold text-brand-orange">
            {(capturedRatio * 100).toFixed(1)}%
          </span>
        </span>
        <span className="text-ink-dim">
          PC1 captures <span className="font-bold text-brand">{(ratios[0] * 100).toFixed(1)}%</span>
        </span>
        <button
          onClick={() => setAngle(pc1Angle)}
          className="rounded border border-brand/30 bg-brand/10 px-2 py-0.5 text-brand transition hover:bg-brand/15"
        >
          snap to PC1
        </button>
      </div>
    </div>
  );
}

// ── 3. Singular value spectrum ──────────────────────────────────────────────

function SvdSpectrumView({ params }: { params: Record<string, unknown> }) {
  const seed = (params.seed as number) ?? 11;
  const m = (params.m as number) ?? 20;
  const n = (params.n as number) ?? 12;
  const trueRank = (params.rank as number) ?? 6;

  const sigma = useMemo(() => {
    const rng = mulberry32(seed);
    const basis: Mat = Array.from({ length: m }, () =>
      Array.from({ length: n }, () => gaussian(rng) * 0.4),
    );
    // Impose a controlled spectrum: sharp decay past `trueRank`.
    const decay = Array.from({ length: Math.min(m, n) }, (_, i) =>
      i < trueRank ? 4 * Math.exp(-i / 8) : 0.35 * Math.exp(-(i - trueRank) / 1.2),
    );
    // A ≈ U Σ V^T is approximated by scaling columns of a random matrix;
    // the spectrum is what matters for this chart.
    const a: Mat = Array.from({ length: m }, (_, i) =>
      Array.from({ length: n }, (_, j) => basis[i][j] * decay[j % decay.length]),
    );
    return svd(a).values;
  }, [seed, m, n, trueRank]);

  const [k, setK] = useState(Math.floor(sigma.length / 2));
  const residual = eckartYoungResidual(sigma, k);
  const total = sigma.reduce((s, x) => s + x * x, 0);
  const retained = total > 0 ? 1 - (residual * residual) / total : 0;

  const maxSigma = Math.max(...sigma, 1e-9);
  const chartH = 190;
  const barW = 100 / sigma.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Spectrum */}
      <div>
        <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          <span>σᵢ (singular values, descending)</span>
          <span>σ₁ = {maxSigma.toFixed(3)}</span>
        </div>
        <div
          className="flex items-end gap-[2px] rounded-xl bg-surface-2 px-3 pb-3 pt-4"
          style={{ height: chartH }}
        >
          {sigma.map((s, i) => {
            const h = (s / maxSigma) * 100;
            const kept = i < k;
            return (
              <div
                key={i}
                className="group relative flex-1"
                style={{ height: `${h}%` }}
                title={`σ${i + 1} = ${s.toFixed(4)}`}
              >
                <div
                  className="absolute inset-0 rounded-t-[3px] transition-all"
                  style={{
                    background: kept ? C.brand : C.dim,
                    opacity: kept ? 0.95 : 0.35,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-dimmer">
          <span>σ₁</span>
          <span>σ{sigma.length}</span>
        </div>
      </div>

      {/* Rank control */}
      <label className="flex items-center gap-3">
        <span className="w-24 shrink-0 font-mono text-[11px] text-ink-dim">rank k</span>
        <input
          type="range"
          min={0}
          max={sigma.length}
          step={1}
          value={k}
          onChange={(e) => setK(Number(e.target.value))}
          className="flex-1 accent-[#1cd6ac]"
        />
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-fg">{k}</span>
      </label>

      {/* Eckart–Young readout */}
      <div className="rounded-xl border border-line bg-surface-2 p-3.5">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brand">
          Eckart–Young
        </div>
        <p className="text-[13px] leading-relaxed text-ink-dim">
          The best rank-{k} approximation has residual Frobenius norm{" "}
          <span className="font-mono font-bold text-fg">{residual.toFixed(5)}</span>, and retains{" "}
          <span className="font-mono font-bold text-brand">{(retained * 100).toFixed(2)}%</span> of the
          squared energy. This is the best possible — no other rank-{k} matrix does better.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dimmer">
          ‖A − A<sub>k</sub>‖<sub>F</sub> = √(Σ<sub>i&gt;k</sub> σᵢ²) ={" "}
          <span className="font-mono">√{sigma.slice(k).reduce((s, x) => s + x * x, 0).toFixed(6)}</span>
        </p>
      </div>
    </div>
  );
}
