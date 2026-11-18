"use client";

import { useId, useMemo, useState } from "react";

/**
 * Capacity calculator.
 *
 * Sizing a transformer deployment is four multiplications, and the point of
 * this widget is that a reader should be able to *feel* them change: doubling
 * the context doubles the cache per session, and every term moves with
 * precision. Nothing here is a canned example — every number printed comes
 * from the controls, so a reader who disagrees with an assumption can change
 * it and watch the answer move.
 *
 * The node constant is 640 GB: eight 80 GB H100s with headroom for the
 * runtime. That is the unit interviewers quote, and it is the unit this page
 * quotes back. Activations, fragmentation and tensor-parallel replication are
 * deliberately excluded — this is the back-of-envelope answer you give before
 * anyone draws a diagram, and pretending otherwise would be dishonest.
 */

// ── Constants ───────────────────────────────────────────────────────────────

const PRECISION_BYTES = {
  FP16: 2,
  FP8: 1,
  INT4: 0.5,
} as const;

type Precision = keyof typeof PRECISION_BYTES;

const PRECISIONS: Precision[] = ["FP16", "FP8", "INT4"];

/** 8 × 80 GB H100s, with room reserved for the runtime. */
const NODE_GB = 640;

const DEFAULT_PARAMS_B = 70;
const DEFAULT_LAYERS = 80;
const DEFAULT_KV_HEADS = 8;
const DEFAULT_HEAD_DIM = 128;
const DEFAULT_SESSIONS = 32;
const DEFAULT_CONTEXT_INDEX = 7; // 128k

/**
 * A ladder rather than a linear slider: 1k → 1M spans three orders of
 * magnitude, so a linear control would spend nine tenths of its travel above
 * 100k and nobody would ever select 4k.
 */
const CONTEXT_STEPS = [
  1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 200_000, 256_000, 400_000, 512_000,
  750_000, 1_000_000,
];

const SESSION_MIN = 1;
const SESSION_MAX = 2000;
const SESSION_SLIDER_STEPS = 1000;

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * Group thousands by hand rather than through `toLocaleString`, because the
 * server and the browser can disagree about the locale and React would then
 * report a hydration mismatch on the very first paint.
 */
function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  const [whole, fraction] = String(Math.abs(rounded)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded < 0 ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

function fmtGB(gb: number): string {
  const digits = gb >= 100 ? 0 : gb >= 10 ? 1 : 2;
  return `${fmt(gb, digits)} GB`;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1e6) return `${fmt(bytes / 1e6, 2)} MB`;
  if (bytes >= 1e3) return `${fmt(bytes / 1e3, 2)} KB`;
  return `${fmt(bytes, 0)} B`;
}

function contextLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${fmt(tokens / 1_000_000, 0)}M`;
  return `${fmt(tokens / 1_000, 0)}k`;
}

// ── Slider mappings ─────────────────────────────────────────────────────────

/**
 * Sessions run 1 → 2000, which is also three orders of magnitude. A log scale
 * keeps 1, 2, 4, 8… reachable; the number input next to the slider is there for
 * anyone who wants an exact value.
 */
function sliderToSessions(position: number): number {
  const ratio = Math.log(SESSION_MAX / SESSION_MIN);
  return Math.round(SESSION_MIN * Math.exp((position / SESSION_SLIDER_STEPS) * ratio));
}

function sessionsToSlider(sessions: number): number {
  const clamped = Math.min(SESSION_MAX, Math.max(SESSION_MIN, sessions));
  return Math.round(
    (Math.log(clamped / SESSION_MIN) / Math.log(SESSION_MAX / SESSION_MIN)) * SESSION_SLIDER_STEPS,
  );
}

function positiveInt(text: string, fallback: number): number {
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

/**
 * Find the model size the note is talking about.
 *
 * The assumptions are prose, so this looks for a number followed by T/B and
 * scores it by what surrounds it: "2.8T total" beats "104B active", and a
 * figure described as active or per-expert is penalised because sizing a
 * cluster from the active count is exactly the mistake this page warns about.
 * When nothing parses, the caller falls back to 70B.
 */
export function parseParamsB(assumptions: string[]): number | null {
  const text = assumptions.join(" ").replace(/,/g, "");
  const pattern = /(\d+(?:\.\d+)?)\s*(t|b|trillion|billion)\b/gi;
  let best: { value: number; score: number } | null = null;

  for (const match of text.matchAll(pattern)) {
    const raw = Number(match[1]);
    if (!Number.isFinite(raw) || raw <= 0) continue;

    const unit = match[2].toLowerCase();
    const value = unit === "t" || unit === "trillion" ? raw * 1000 : raw;
    const start = match.index ?? 0;
    const after = text.slice(start + match[0].length, start + match[0].length + 26).toLowerCase();
    const before = text.slice(Math.max(0, start - 18), start).toLowerCase();

    let score = 0;
    if (/\btotal\b/.test(after)) score += 5;
    if (/\bparam/.test(after)) score += 2;
    if (/\bactiv/.test(after)) score -= 4;
    if (/\bactiv|\bper\s+expert/.test(before)) score -= 3;
    if (unit === "t" || unit === "trillion") score += 1;

    if (!best || score > best.score || (score === best.score && value > best.value)) {
      best = { value, score };
    }
  }

  return best ? Math.round(best.value * 10) / 10 : null;
}

// ── Component ───────────────────────────────────────────────────────────────

export function CapacityCalculator({ assumptions = [] }: { assumptions?: string[] }) {
  const uid = useId();
  const noteParams = useMemo(() => parseParamsB(assumptions), [assumptions]);
  const defaultParams = noteParams ?? DEFAULT_PARAMS_B;

  const [paramsText, setParamsText] = useState(String(defaultParams));
  const [precision, setPrecision] = useState<Precision>("FP16");
  const [contextIndex, setContextIndex] = useState(DEFAULT_CONTEXT_INDEX);
  const [sessionText, setSessionText] = useState(String(DEFAULT_SESSIONS));
  const [geometry, setGeometry] = useState({
    layers: String(DEFAULT_LAYERS),
    kvHeads: String(DEFAULT_KV_HEADS),
    headDim: String(DEFAULT_HEAD_DIM),
  });

  const bytesPerParam = PRECISION_BYTES[precision];
  const context = CONTEXT_STEPS[contextIndex] ?? CONTEXT_STEPS[DEFAULT_CONTEXT_INDEX];
  const sessions = Math.min(SESSION_MAX, positiveInt(sessionText, DEFAULT_SESSIONS));
  const layers = positiveInt(geometry.layers, DEFAULT_LAYERS);
  const kvHeads = positiveInt(geometry.kvHeads, DEFAULT_KV_HEADS);
  const headDim = positiveInt(geometry.headDim, DEFAULT_HEAD_DIM);

  const paramsParsed = Number(paramsText);
  const paramsB = Number.isFinite(paramsParsed) && paramsParsed > 0 ? paramsParsed : 0;

  // The four formulas, evaluated. GB is params × 10⁹ × bytes ÷ 10⁹, which
  // reduces to params (in billions) × bytes — kept expanded so the units are
  // visible to anyone checking the arithmetic.
  const weightsGB = (paramsB * 1e9 * bytesPerParam) / 1e9;
  const kvPerTokenBytes = 2 * layers * kvHeads * headDim * bytesPerParam;
  const kvPerSessionGB = (kvPerTokenBytes * context) / 1e9;
  const kvTotalGB = kvPerSessionGB * sessions;
  const totalGB = weightsGB + kvTotalGB;
  const nodes = Math.ceil(totalGB / NODE_GB);
  const pctOfNode = (totalGB / NODE_GB) * 100;

  const scaleMax = Math.max(totalGB, NODE_GB);
  const weightsWidth = (weightsGB / scaleMax) * 100;
  const kvWidth = (kvTotalGB / scaleMax) * 100;
  const nodeBoundary = (NODE_GB / scaleMax) * 100;

  const verdict = buildVerdict({
    paramsB,
    sessions,
    context,
    weightsGB,
    kvTotalGB,
    totalGB,
    nodes,
    pctOfNode,
  });

  function reset() {
    setParamsText(String(defaultParams));
    setPrecision("FP16");
    setContextIndex(DEFAULT_CONTEXT_INDEX);
    setSessionText(String(DEFAULT_SESSIONS));
    setGeometry({
      layers: String(DEFAULT_LAYERS),
      kvHeads: String(DEFAULT_KV_HEADS),
      headDim: String(DEFAULT_HEAD_DIM),
    });
  }

  const ctxId = `${uid}-context`;
  const sessionsId = `${uid}-sessions`;
  const paramsId = `${uid}-params`;

  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-brand">
            Calculator
          </h3>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">
            Every number below recomputes from these controls — nothing on this card is canned.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-line bg-surface-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition hover:border-line-2 hover:text-fg"
        >
          Reset
        </button>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor={ctxId}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer"
            >
              Context length
            </label>
            <span className="font-mono text-[13px] text-brand">{contextLabel(context)} tokens</span>
          </div>
          <input
            id={ctxId}
            type="range"
            min={0}
            max={CONTEXT_STEPS.length - 1}
            step={1}
            value={contextIndex}
            onChange={(e) => setContextIndex(Number(e.target.value))}
            aria-valuetext={`${contextLabel(context)} tokens`}
            className="mt-2 w-full cursor-pointer accent-brand"
          />
          <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-ink-dimmer">
            <span>1k</span>
            <span>1M</span>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor={sessionsId}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer"
            >
              Concurrent sessions
            </label>
            <input
              type="number"
              min={SESSION_MIN}
              max={SESSION_MAX}
              value={sessionText}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = Number.parseInt(raw, 10);
                // Keep the field and the arithmetic in agreement: the slider
                // cannot represent more than 2,000, so the text input must not
                // silently mean something else.
                setSessionText(
                  Number.isFinite(parsed) && parsed > SESSION_MAX ? String(SESSION_MAX) : raw,
                );
              }}
              aria-label="Concurrent sessions, exact value"
              className="w-20 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-right font-mono text-[12px] text-brand focus:border-brand focus:outline-none"
            />
          </div>
          <input
            id={sessionsId}
            type="range"
            min={0}
            max={SESSION_SLIDER_STEPS}
            step={1}
            value={sessionsToSlider(sessions)}
            onChange={(e) => setSessionText(String(sliderToSessions(Number(e.target.value))))}
            aria-valuetext={`${sessions} sessions`}
            className="mt-2 w-full cursor-pointer accent-brand"
          />
          <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-ink-dimmer">
            <span>1</span>
            <span>2,000</span>
          </div>
        </div>

        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
            Precision
          </span>
          <div
            role="group"
            aria-label="Weight precision"
            className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1"
          >
            {PRECISIONS.map((p) => {
              const active = precision === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPrecision(p)}
                  className={`rounded-md px-1.5 py-1 text-center transition ${
                    active
                      ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                      : "text-ink-dim hover:bg-surface-3 hover:text-fg"
                  }`}
                >
                  <span className="block font-mono text-[11px] leading-tight">{p}</span>
                  <span className="block font-mono text-[9px] leading-tight opacity-70">
                    {PRECISION_BYTES[p]} B/param
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor={paramsId}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer"
          >
            Model size
          </label>
          <div className="relative mt-2">
            <input
              id={paramsId}
              type="number"
              min={1}
              step={1}
              value={paramsText}
              onChange={(e) => setParamsText(e.target.value)}
              className="w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 pr-14 font-mono text-[13px] text-fg focus:border-brand focus:outline-none"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center font-mono text-[11px] text-ink-dimmer">
              B params
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-ink-dimmer">
            {noteParams !== null
              ? `Defaulted from this note's assumptions (${fmt(noteParams, noteParams < 10 ? 1 : 0)}B). Total parameters, not active.`
              : "This note states no parameter count, so it starts at 70B."}
          </p>
        </div>
      </div>

      {/* ── Geometry ──────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
            Model geometry
          </span>
          <span className="font-mono text-[9.5px] text-ink-dimmer">
            starter shape — edit to match the real model
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              { key: "layers", label: "layers", value: geometry.layers },
              { key: "kvHeads", label: "KV heads", value: geometry.kvHeads },
              { key: "headDim", label: "head dim", value: geometry.headDim },
            ] as const
          ).map((field) => (
            <label key={field.key} className="block">
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                {field.label}
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={field.value}
                onChange={(e) =>
                  setGeometry((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-1 font-mono text-[12px] text-fg focus:border-brand focus:outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      {/* ── Verdict ───────────────────────────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-brand/80">Verdict</p>
        <p className="mt-1 text-[14px] font-medium leading-relaxed text-fg">{verdict}</p>
      </div>

      {/* ── Headline numbers ──────────────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Weights" value={fmtGB(weightsGB)} tone="brand" />
        <Stat label="Cache / session" value={fmtGB(kvPerSessionGB)} tone="orange" />
        <Stat label="Total" value={fmtGB(totalGB)} />
        <Stat label="H100 nodes" value={paramsB > 0 ? String(nodes) : "—"} />
      </div>

      {/* ── Bar ───────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <div className="relative h-3 overflow-hidden rounded-full bg-surface-4">
          <div className="flex h-full">
            <div className="h-full bg-brand/70" style={{ width: `${weightsWidth}%` }} />
            <div className="h-full bg-brand-orange/80" style={{ width: `${kvWidth}%` }} />
          </div>
          <div
            className="absolute inset-y-0 w-px bg-fg/60"
            style={{ left: `${nodeBoundary}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[9.5px] text-ink-dimmer">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-2.5 rounded-sm bg-brand/70" /> weights
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-2.5 rounded-sm bg-brand-orange/80" /> KV cache
            </span>
          </span>
          <span>
            total {fmtGB(totalGB)} · {fmt(pctOfNode, pctOfNode >= 100 ? 0 : 1)}% of one node
            {pctOfNode >= 100 ? ` (${fmt(pctOfNode / 100, 1)}×)` : ""}
          </span>
        </div>
      </div>

      {/* ── Worked formulas ───────────────────────────────────────────── */}
      <dl className="mt-4 space-y-1 rounded-xl bg-surface-4 px-3 py-2.5 font-mono text-[11px] leading-relaxed">
        <FormulaRow
          label="weights"
          expression={`${fmt(paramsB, paramsB < 10 ? 2 : 0)} B × ${bytesPerParam} B/param`}
          result={`${fmtGB(weightsGB)}`}
        />
        <FormulaRow
          label="KV / token"
          expression={`2 × ${layers} layers × ${kvHeads} heads × ${headDim} dim × ${bytesPerParam} B`}
          result={fmtBytes(kvPerTokenBytes)}
        />
        <FormulaRow
          label="KV / session"
          expression={`${fmtBytes(kvPerTokenBytes)} × ${contextLabel(context)} tokens`}
          result={fmtGB(kvPerSessionGB)}
        />
        <FormulaRow
          label="KV total"
          expression={`${fmtGB(kvPerSessionGB)} × ${fmt(sessions, 0)} sessions`}
          result={fmtGB(kvTotalGB)}
        />
        <FormulaRow
          label="total"
          expression={`${fmtGB(weightsGB)} + ${fmtGB(kvTotalGB)}`}
          result={fmtGB(totalGB)}
        />
        <FormulaRow
          label="nodes"
          expression={`⌈${fmt(totalGB, 0)} ÷ ${NODE_GB}⌉`}
          result={paramsB > 0 ? `${nodes} node${nodes === 1 ? "" : "s"}` : "—"}
        />
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-dimmer">
        weights = params × bytes/param · KV/token = 2 × layers × kv_heads × head_dim ×
        bytes/param · KV/session = KV/token × context · total = weights + KV/session × sessions ·
        nodes = ⌈total ÷ 640⌉. Activations, fragmentation and replication are on top of this — it is
        the first number to say out loud, not the last.
      </p>
    </div>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "brand" | "orange";
}) {
  const toneClass =
    tone === "brand" ? "text-brand" : tone === "orange" ? "text-brand-orange" : "text-fg";
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dimmer">{label}</div>
      <div className={`mt-0.5 font-mono text-[15px] leading-tight ${toneClass}`}>{value}</div>
    </div>
  );
}

function FormulaRow({
  label,
  expression,
  result,
}: {
  label: string;
  expression: string;
  result: string;
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-3">
      <dt className="text-ink-dimmer">{label}</dt>
      <dd className="text-ink-dim">
        {expression} <span className="text-ink-dimmer">=</span>{" "}
        <span className="text-brand">{result}</span>
      </dd>
    </div>
  );
}

/**
 * One plain sentence, chosen from the numbers rather than written per case.
 * The order matters: weights that do not fit are a different failure from a
 * cache that does not fit, and saying which one you hit is the difference
 * between an answer and a guess.
 */
function buildVerdict(input: {
  paramsB: number;
  sessions: number;
  context: number;
  weightsGB: number;
  kvTotalGB: number;
  totalGB: number;
  nodes: number;
  pctOfNode: number;
}): string {
  const { paramsB, sessions, context, weightsGB, kvTotalGB, totalGB, nodes, pctOfNode } = input;

  if (paramsB <= 0) {
    return "Enter a parameter count — the weight estimate scales straight from it.";
  }
  if (weightsGB > NODE_GB) {
    const weightNodes = Math.ceil(weightsGB / NODE_GB);
    return `The weights alone are ${fmtGB(weightsGB)} — that is ${weightNodes} nodes before you cache a single token.`;
  }
  if (kvTotalGB > NODE_GB) {
    const cacheNodes = Math.ceil(kvTotalGB / NODE_GB);
    return `Too big for one node — you need ${cacheNodes} node${cacheNodes === 1 ? "" : "s"} just for the cache at ${fmt(sessions, 0)} session${sessions === 1 ? "" : "s"} of ${contextLabel(context)} context.`;
  }
  if (totalGB > NODE_GB) {
    const cacheShare = Math.round((kvTotalGB / totalGB) * 100);
    return `Too big for one node — all ${nodes} nodes are in play, and ${cacheShare}% of that is KV cache.`;
  }
  if (pctOfNode > 85) {
    return `One node holds it, but at ${Math.round(pctOfNode)}% there is almost nothing left for activations or fragmentation.`;
  }
  return `One node holds this comfortably — ${Math.round(pctOfNode)}% of 640 GB used, with ${fmtGB(NODE_GB - totalGB)} left over.`;
}
