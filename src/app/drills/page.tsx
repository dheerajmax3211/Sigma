"use client";

/**
 * Rapid-fire arithmetic drills.
 *
 * Everything on this page is computed from the four closed-form identities an
 * AI interview actually asks you to do in your head:
 *
 *   params  = in·out + out            (linear layer, bias included)
 *   KV      = 2·L·H_kv·d·tokens·bytes (K and V, one sequence)
 *   FLOPs   = 2·P·tokens              (forward pass, per token)
 *   weights = P·bytes                 (decimal GB)
 *
 * No YAML, no model, no network. The question set is a pure function of the
 * round number, so round 1 is byte-identical on every device (and on the
 * server during prerender), while "run it again" walks a different fixed deck.
 * Distractors are not random noise: each one is a specific, common slip —
 * dropping the bias, using heads instead of kv_heads, bytes vs bits, or an
 * off-by-2× — so a wrong pick tells you which formula you half-remembered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TOTAL = 20;
const CLOCK_SECONDS = 60;
const TIMED_OUT = -1;
const SEED_BASE = 0x1a2b3c4d;

type Kind = "params" | "kv" | "flops" | "weights";

/** `all` mixes the four formulas; any other value drills one formula only. */
type Category = "all" | Kind;

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "all", label: "All" },
  { value: "params", label: "Parameters" },
  { value: "kv", label: "KV cache" },
  { value: "flops", label: "FLOPs" },
  { value: "weights", label: "Weights" },
];

function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? "All";
}

interface Given {
  k: string;
  v: string;
}

interface Drill {
  kind: Kind;
  label: string;
  question: string;
  given: Given[];
  options: string[];
  correct: number;
  derivation: string;
}

/* ── deterministic PRNG ─────────────────────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── formatting ─────────────────────────────────────────────────────────── */

function commas(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Four significant digits, trailing zeros trimmed: 1.342, 65.54, 14. */
function sig(n: number, digits = 4): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const dp = Math.max(0, Math.min(6, digits - 1 - exp));
  const s = n.toFixed(dp);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

const gb = (bytes: number): string => `${sig(bytes / 1e9)} GB`;
const tflops = (flops: number): string => `${sig(flops / 1e12)} TFLOPs`;
const billions = (params: number): string => `${sig(params / 1e9)}e9`;

/** One-line scientific value for a derivation, e.g. 6.554e13. */
function sci(n: number): string {
  const exp = Math.floor(Math.log10(n));
  return `${(n / 10 ** exp).toFixed(3)}e${exp}`;
}

/* ── question construction ──────────────────────────────────────────────── */

function assemble(
  correctValue: number,
  candidates: readonly number[],
  format: (v: number) => string,
  rand: () => number,
): { options: string[]; correct: number } {
  const correctText = format(correctValue);
  const seen = new Set<string>([correctText]);
  const wrong: string[] = [];

  const push = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const text = format(value);
    if (seen.has(text)) return;
    seen.add(text);
    wrong.push(text);
  };

  candidates.forEach(push);
  // Fallbacks keep exactly three distinct distractors even when two named
  // mistakes happen to collapse onto the same printed value (e.g. fp16 and an
  // off-by-2× at the same precision).
  for (const mult of [3, 0.4, 1.5, 0.25, 6, 0.75, 4, 0.125]) {
    if (wrong.length >= 3) break;
    push(correctValue * mult);
  }

  const options = wrong.slice(0, 3);
  const slot = Math.floor(rand() * 4);
  options.splice(slot, 0, correctText);
  return { options, correct: slot };
}

const PARAM_POOL = [
  { in: 768, out: 3072 },
  { in: 1024, out: 4096 },
  { in: 4096, out: 11008 },
  { in: 2048, out: 8192 },
  { in: 896, out: 4864 },
  { in: 1536, out: 6144 },
  { in: 512, out: 2048 },
  { in: 2048, out: 4096 },
  { in: 7168, out: 18432 },
  { in: 3072, out: 8192 },
] as const;

interface KvConfig {
  layers: number;
  kvHeads: number;
  headDim: number;
  tokens: number;
  bytes: number;
  precision: string;
}

const KV_POOL: readonly KvConfig[] = [
  { layers: 80, kvHeads: 8, headDim: 128, tokens: 8192, bytes: 1, precision: "fp8" },
  { layers: 32, kvHeads: 8, headDim: 128, tokens: 4096, bytes: 2, precision: "fp16" },
  { layers: 40, kvHeads: 8, headDim: 128, tokens: 8192, bytes: 2, precision: "fp16" },
  { layers: 60, kvHeads: 8, headDim: 128, tokens: 16384, bytes: 1, precision: "fp8" },
  { layers: 48, kvHeads: 4, headDim: 256, tokens: 8192, bytes: 2, precision: "fp16" },
  { layers: 96, kvHeads: 8, headDim: 64, tokens: 4096, bytes: 1, precision: "fp8" },
  { layers: 28, kvHeads: 4, headDim: 128, tokens: 32768, bytes: 2, precision: "fp16" },
  { layers: 32, kvHeads: 8, headDim: 128, tokens: 16384, bytes: 1, precision: "fp8" },
];

const FLOPS_POOL = [
  { params: 8e9, batch: 4096 },
  { params: 7e9, batch: 2048 },
  { params: 3e9, batch: 8192 },
  { params: 13e9, batch: 4096 },
  { params: 70e9, batch: 2048 },
  { params: 22e9, batch: 1024 },
  { params: 30e9, batch: 4096 },
  { params: 405e9, batch: 2048 },
] as const;

const WEIGHT_POOL = [
  { params: 7e9, bytes: 2, precision: "fp16" },
  { params: 8e9, bytes: 1, precision: "fp8" },
  { params: 13e9, bytes: 0.5, precision: "int4" },
  { params: 70e9, bytes: 2, precision: "fp16" },
  { params: 3e9, bytes: 0.5, precision: "int4" },
  { params: 405e9, bytes: 1, precision: "fp8" },
  { params: 30e9, bytes: 2, precision: "fp16" },
  { params: 1e9, bytes: 1, precision: "fp8" },
] as const;

function makeParams(rand: () => number, cfg: (typeof PARAM_POOL)[number]): Drill {
  const { in: i, out: o } = cfg;
  const correctValue = i * o + o;
  const { options, correct } = assemble(
    correctValue,
    [i * o, i * o + i, correctValue * 2],
    commas,
    rand,
  );
  return {
    kind: "params",
    label: "Parameter count",
    question: `A linear layer reads ${i} features and writes ${o}. How many parameters does it hold, bias included?`,
    given: [
      { k: "in", v: commas(i) },
      { k: "out", v: commas(o) },
      { k: "bias", v: "1 per output" },
    ],
    options,
    correct,
    derivation: `${commas(i)} × ${commas(o)} + ${commas(o)} = ${commas(correctValue)}`,
  };
}

function makeKv(rand: () => number, cfg: KvConfig): Drill {
  const { layers: L, kvHeads, headDim: d, tokens, bytes, precision } = cfg;
  const heads = kvHeads * 4; // GQA: full query heads, one quarter as many KV heads
  const correctBytes = 2 * L * kvHeads * d * tokens * bytes;
  const { options, correct } = assemble(
    correctBytes,
    [
      // used `heads` instead of `kv_heads`
      2 * L * heads * d * tokens * bytes,
      // bytes vs bits
      correctBytes * 8,
      // forgot that K and V are both cached
      correctBytes / 2,
    ],
    gb,
    rand,
  );
  return {
    kind: "kv",
    label: "KV cache",
    question: `One sequence of ${commas(tokens)} tokens runs through ${L} layers with ${kvHeads} KV heads of dim ${d}, cached in ${precision}. How many GB is the KV cache?`,
    given: [
      { k: "layers", v: commas(L) },
      { k: "heads", v: commas(heads) },
      { k: "kv_heads", v: commas(kvHeads) },
      { k: "head_dim", v: commas(d) },
      { k: "tokens", v: commas(tokens) },
      { k: "bytes/elt", v: `${bytes} B (${precision})` },
    ],
    options,
    correct,
    derivation: `2 × ${L} × ${kvHeads} × ${d} × ${tokens} × ${bytes} B = ${gb(correctBytes)}`,
  };
}

function makeFlops(rand: () => number, cfg: (typeof FLOPS_POOL)[number]): Drill {
  const { params: P, batch } = cfg;
  const correctFlops = 2 * P * batch;
  const { options, correct } = assemble(
    correctFlops,
    [
      // forgot the factor 2 (multiply + add per weight)
      P * batch,
      // per single token, batch ignored
      2 * P,
      // counted 4 FLOPs per parameter
      4 * P * batch,
    ],
    tflops,
    rand,
  );
  return {
    kind: "flops",
    label: "FLOPs",
    question: `A forward pass costs 2 FLOPs per active parameter per token. For ${billions(P)} active parameters, how many TFLOPs does a batch of ${commas(batch)} tokens take?`,
    given: [
      { k: "active params", v: billions(P) },
      { k: "flops/token", v: "2 × P" },
      { k: "batch tokens", v: commas(batch) },
    ],
    options,
    correct,
    derivation: `2 × ${billions(P)} × ${batch} = ${sci(correctFlops)} FLOPs = ${tflops(correctFlops)}`,
  };
}

function makeWeights(rand: () => number, cfg: (typeof WEIGHT_POOL)[number]): Drill {
  const { params: P, bytes, precision } = cfg;
  const correctBytes = P * bytes;
  const { options, correct } = assemble(
    correctBytes,
    [
      // bytes vs bits
      correctBytes * 8,
      // assumed fp16 for the conversion
      P * 2,
      // double counted the weights
      correctBytes * 2,
    ],
    gb,
    rand,
  );
  return {
    kind: "weights",
    label: "Weight memory",
    question: `A model has ${billions(P)} parameters stored in ${precision} (${bytes} B each). How much memory do the weights need, in GB?`,
    given: [
      { k: "params", v: billions(P) },
      { k: "precision", v: precision },
      { k: "bytes/param", v: `${bytes} B` },
    ],
    options,
    correct,
    derivation: `${billions(P)} × ${bytes} B = ${gb(correctBytes)}`,
  };
}

/**
 * Round `n` is a pure function of `n` and the category: the same 20
 * questions, in the same order, with the same option order, on every render
 * and every machine. The category only changes which generators feed the
 * deck — the seed derivation is untouched, so "All" reproduces the original
 * mixed round byte for byte.
 */
function buildRound(round: number, category: Category = "all"): Drill[] {
  const rand = mulberry32(SEED_BASE + Math.imul(round, 0x9e3779b1));

  if (category !== "all") return buildCategoryRound(rand, category);

  // Five of each type, shuffled so the order is not a predictable cycle.
  const kinds: Kind[] = shuffled(
    [
      ...Array<Kind>(5).fill("params"),
      ...Array<Kind>(5).fill("kv"),
      ...Array<Kind>(5).fill("flops"),
      ...Array<Kind>(5).fill("weights"),
    ],
    rand,
  );

  const decks = {
    params: shuffled(PARAM_POOL, rand),
    kv: shuffled(KV_POOL, rand),
    flops: shuffled(FLOPS_POOL, rand),
    weights: shuffled(WEIGHT_POOL, rand),
  };
  const cursor = { params: 0, kv: 0, flops: 0, weights: 0 };

  return kinds.map((kind) => {
    if (kind === "params") return makeParams(rand, decks.params[cursor.params++ % decks.params.length]);
    if (kind === "kv") return makeKv(rand, decks.kv[cursor.kv++ % decks.kv.length]);
    if (kind === "flops") return makeFlops(rand, decks.flops[cursor.flops++ % decks.flops.length]);
    return makeWeights(rand, decks.weights[cursor.weights++ % decks.weights.length]);
  });
}

/**
 * Twenty questions from one pool. The pool is finite (8–10 configs), so a
 * single-formula round cycles it; each pass still consumes fresh randomness
 * for the option slot, so a repeat is not a byte-identical card.
 */
function buildCategoryRound(rand: () => number, category: Kind): Drill[] {
  if (category === "params") {
    const deck = shuffled(PARAM_POOL, rand);
    return Array.from({ length: TOTAL }, (_, i) => makeParams(rand, deck[i % deck.length]));
  }
  if (category === "kv") {
    const deck = shuffled(KV_POOL, rand);
    return Array.from({ length: TOTAL }, (_, i) => makeKv(rand, deck[i % deck.length]));
  }
  if (category === "flops") {
    const deck = shuffled(FLOPS_POOL, rand);
    return Array.from({ length: TOTAL }, (_, i) => makeFlops(rand, deck[i % deck.length]));
  }
  const deck = shuffled(WEIGHT_POOL, rand);
  return Array.from({ length: TOTAL }, (_, i) => makeWeights(rand, deck[i % deck.length]));
}

/* ── page ───────────────────────────────────────────────────────────────── */

const emptyAnswers = (): (number | null)[] => Array<number | null>(TOTAL).fill(null);

function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export default function DrillsPage() {
  const [round, setRound] = useState(1);
  const [category, setCategory] = useState<Category>("all");
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<(number | null)[]>(emptyAnswers);
  const [secondsLeft, setSecondsLeft] = useState(CLOCK_SECONDS);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<"drilling" | "done">("drilling");

  const questions = useMemo(() => buildRound(round, category), [round, category]);
  const drill = questions[index];
  const selected = chosen[index];
  const answered = selected !== null;
  const started = chosen.some((answer) => answer !== null);
  const locked = phase === "drilling" && started;

  // Seconds banked for the current question. Pausing tears down the interval;
  // this ref is what resume continues from, so a pause is not a free refill.
  const bankedSeconds = useRef(CLOCK_SECONDS);

  // Live score, current streak, and best streak come straight from the answer
  // sheet — no separate counters to drift out of sync.
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  for (let i = 0; i < TOTAL; i += 1) {
    if (chosen[i] === null) break;
    if (chosen[i] === questions[i].correct) {
      score += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }

  // A fresh question — or a new round or category — starts at the full budget.
  useEffect(() => {
    bankedSeconds.current = CLOCK_SECONDS;
    setSecondsLeft(CLOCK_SECONDS);
  }, [round, index, phase, category]);

  // One 60-second clock per question. It starts when the question appears and
  // stops the instant an answer is locked, so feedback is never rushed. While
  // paused the interval is gone and the banked remainder is kept.
  useEffect(() => {
    if (phase !== "drilling" || chosen[index] !== null || paused) return;
    const budget = bankedSeconds.current;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const remaining = Math.max(0, budget - (Date.now() - startedAt) / 1000);
      bankedSeconds.current = remaining;
      setSecondsLeft(remaining);
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, index, chosen, paused]);

  // Expiry locks the question as a miss rather than silently skipping it.
  useEffect(() => {
    if (paused) return;
    if (phase !== "drilling" || chosen[index] !== null || secondsLeft > 0) return;
    setChosen((prev) => {
      if (prev[index] !== null) return prev;
      const next = prev.slice();
      next[index] = TIMED_OUT;
      return next;
    });
  }, [secondsLeft, chosen, index, phase, paused]);

  const choose = useCallback(
    (pick: number) => {
      if (paused) return;
      setChosen((prev) => {
        if (prev[index] !== null) return prev;
        const next = prev.slice();
        next[index] = pick;
        return next;
      });
    },
    [index, paused],
  );

  const next = useCallback(() => {
    if (chosen[index] === null) return;
    if (index === TOTAL - 1) {
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    // `paused` is deliberately untouched: pausing survives a question
    // advance instead of quietly resuming the clock on the next card.
  }, [chosen, index]);

  const startRound = useCallback((nextCategory: Category) => {
    setCategory(nextCategory);
    setRound((r) => r + 1);
    setIndex(0);
    setChosen(emptyAnswers());
    setSecondsLeft(CLOCK_SECONDS);
    bankedSeconds.current = CLOCK_SECONDS;
    setPaused(false);
    setPhase("drilling");
  }, []);

  const restart = useCallback(() => startRound(category), [startRound, category]);

  const pickCategory = useCallback(
    (nextCategory: Category) => {
      // On the results screen the old answer sheet belongs to the old deck, so
      // a category pick there starts the next round rather than rescoring it.
      if (phase === "done") {
        startRound(nextCategory);
        return;
      }
      setCategory(nextCategory);
    },
    [phase, startRound],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (phase !== "drilling") return;
      if (event.key >= "1" && event.key <= "4") {
        if (paused) {
          event.preventDefault();
          return;
        }
        if (chosen[index] === null) {
          event.preventDefault();
          choose(Number(event.key) - 1);
        }
        return;
      }
      if ((event.key === "Enter" || event.key === "ArrowRight") && chosen[index] !== null) {
        event.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, index, chosen, choose, next, paused]);

  const missed = questions
    .map((q, i) => ({ question: q, number: i + 1, pick: chosen[i] }))
    .filter((row) => row.pick !== row.question.correct);
  const accuracy = Math.round((score / TOTAL) * 100);
  const lowTime = answered || paused ? false : secondsLeft <= 10;

  return (
    <main className="mx-auto max-w-[900px] px-5 py-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-orange">
        Drills
      </p>
      <h1 className="max-w-[22ch] text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-fg">
        Drills — the arithmetic they actually ask
      </h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
        Twenty questions, sixty seconds each. Drill one formula or mix all
        four, answer with the mouse or keys{" "}
        <span className="font-mono text-fg">1–4</span>, and the derivation
        appears the moment you commit. Nothing here is generated by a model —
        every number is computed in this page.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          category
        </span>
        <div role="group" aria-label="Question category" className="flex flex-wrap gap-1">
          {CATEGORIES.map((option) => {
            const on = category === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => pickCategory(option.value)}
                disabled={locked}
                aria-pressed={on}
                className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
                  on
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-line text-ink-dimmer hover:text-fg"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[11.5px] leading-relaxed text-ink-dimmer">
          {phase === "done"
            ? "pick a category to start the next round"
            : locked
              ? `locked for this round — ${categoryLabel(category).toLowerCase()} deck`
              : "20 questions from one formula, or a mix of all four"}
        </span>
      </div>

      {phase === "drilling" ? (
        <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface-1">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line bg-surface-2/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span className="text-ink-dimmer">
              drill<span className="text-brand">/</span>round {round}
              <span className="ml-2 normal-case tracking-normal text-ink-dimmer">
                · {categoryLabel(category)}
              </span>
            </span>
            <span className="ml-auto text-ink-dimmer">
              score <span className="text-fg">{score}/{TOTAL}</span>
            </span>
            <span className="text-ink-dimmer">
              streak <span className={streak > 0 ? "text-brand" : "text-fg"}>{streak}</span>
            </span>
            <span className={lowTime || paused ? "text-brand-orange" : "text-ink-dimmer"}>
              clock <span className="tabular-nums">{clock(secondsLeft)}</span>
              {paused && <span className="ml-1.5">paused</span>}
            </span>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              aria-label={paused ? "Resume the question clock" : "Pause the question clock"}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] transition ${
                paused
                  ? "border-brand-orange/50 bg-brand-orange/15 text-brand-orange"
                  : "border-line text-ink-dimmer hover:text-fg"
              }`}
            >
              {paused ? "resume" : "pause"}
            </button>
          </div>

          <div className="flex gap-[3px] px-4 pb-1 pt-2.5">
            {questions.map((q, i) => {
              const pick = chosen[i];
              const tone =
                pick === null
                  ? i === index
                    ? "bg-brand-orange/80"
                    : "bg-line-2"
                  : pick === q.correct
                    ? "bg-brand"
                    : "bg-brand-orange";
              return <span key={i} className={`h-[3px] flex-1 rounded-full ${tone}`} />;
            })}
          </div>

          <div className="px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em]">
              <span className="text-brand">{drill.label}</span>
              <span className="text-ink-dimmer">·</span>
              <span className="text-ink-dimmer">
                q{index + 1}/{TOTAL}
              </span>
            </div>

            <p className="mt-3 max-w-[64ch] text-[15.5px] leading-relaxed text-fg">
              {drill.question}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface-2 px-4 py-3 font-mono text-[12.5px] sm:grid-cols-3">
              {drill.given.map((g) => (
                <div
                  key={g.k}
                  className="flex items-baseline justify-between gap-3 border-b border-line pb-1 last:border-0 sm:border-0 sm:pb-0"
                >
                  <dt className="text-ink-dimmer">{g.k}</dt>
                  <dd className="tabular-nums text-fg">{g.v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {drill.options.map((option, i) => {
                const isCorrect = i === drill.correct;
                const isPicked = selected === i;
                const dim = answered && !isCorrect && !isPicked;
                return (
                  <button
                    key={`${drill.label}-${i}`}
                    type="button"
                    onClick={() => choose(i)}
                    disabled={answered || paused}
                    aria-label={`Answer ${i + 1}: ${option}`}
                    className={[
                      "flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition",
                      !answered && !paused && "border-line bg-surface-2 hover:border-brand/45 hover:bg-surface-3",
                      !answered && paused && "cursor-not-allowed border-line bg-surface-2 opacity-55",
                      answered && isCorrect && "border-brand/60 bg-brand/10",
                      answered && isPicked && !isCorrect && "border-brand-orange/60 bg-brand-orange/10",
                      dim && "border-line bg-surface-2 opacity-40",
                      answered || paused ? "cursor-not-allowed" : "cursor-pointer",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span
                      className={[
                        "grid h-6 w-6 shrink-0 place-items-center rounded border font-mono text-[11px]",
                        answered && isCorrect
                          ? "border-brand/50 text-brand"
                          : answered && isPicked
                            ? "border-brand-orange/50 text-brand-orange"
                            : "border-line-2 text-ink-dimmer",
                      ].join(" ")}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={[
                        "font-mono text-[15.5px] tabular-nums",
                        answered && isCorrect
                          ? "text-brand"
                          : answered && isPicked
                            ? "text-brand-orange"
                            : "text-fg",
                      ].join(" ")}
                    >
                      {option}
                    </span>
                    {answered && isCorrect && (
                      <span className="ml-auto font-mono text-[11px] text-brand">✓</span>
                    )}
                    {answered && isPicked && !isCorrect && (
                      <span className="ml-auto font-mono text-[11px] text-brand-orange">✗</span>
                    )}
                  </button>
                );
              })}
            </div>

            {answered && (
              <div className="mt-4 animate-fade">
                <p
                  className={`font-mono text-[12px] uppercase tracking-[0.12em] ${
                    selected === drill.correct ? "text-brand" : "text-brand-orange"
                  }`}
                >
                  {selected === TIMED_OUT
                    ? `clock expired — answer ${drill.options[drill.correct]}`
                    : selected === drill.correct
                      ? "correct"
                      : `not quite — answer ${drill.options[drill.correct]}`}
                </p>
                <div className="mt-2 border-l-2 border-brand/40 pl-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">
                    derivation
                  </p>
                  <p className="mt-1 font-mono text-[12.5px] leading-relaxed text-ink-dim">
                    {drill.derivation}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">
                {paused ? "paused — answering is disabled" : "keys 1–4 answer · enter next"}
              </p>
              <button
                type="button"
                onClick={next}
                disabled={!answered}
                className="rounded-lg bg-brand px-8 py-3 text-[14px] font-semibold text-bg transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-dimmer"
              >
                {index === TOTAL - 1 ? "See results" : "Next"} <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-7 overflow-hidden rounded-xl border border-line bg-surface-1">
          <div className="border-b border-line bg-surface-2/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">
            drill<span className="text-brand">/</span>round {round} · {categoryLabel(category)} ·
            complete
          </div>

          <div className="px-5 py-6 sm:px-7">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">
                  accuracy
                </p>
                <p className="mt-1 font-mono text-[44px] leading-none text-brand">
                  {accuracy}%
                </p>
              </div>
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">
                  score
                </p>
                <p className="mt-1 font-mono text-[24px] leading-none text-fg">
                  {score}/{TOTAL}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">
                  best streak
                </p>
                <p className="mt-1 font-mono text-[24px] leading-none text-fg">{bestStreak}</p>
              </div>
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">
                  missed
                </p>
                <p className="mt-1 font-mono text-[24px] leading-none text-brand-orange">
                  {missed.length}
                </p>
              </div>
            </div>

            <h2 className="mt-7 font-mono text-[10.5px] uppercase tracking-[0.18em] text-brand-orange">
              What to fix
            </h2>

            {missed.length === 0 ? (
              <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-ink-dim">
                Clean sweep. Every formula landed under the clock — run a fresh
                round to prove it was not the numbers.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {missed.slice(0, 3).map((row) => (
                  <li
                    key={row.number}
                    className="rounded-lg border border-line bg-surface-2 px-4 py-3"
                  >
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dimmer">
                      q{row.number} · {row.question.label}
                    </p>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg">
                      {row.question.question}
                    </p>
                    <p className="mt-2 font-mono text-[12px] text-brand-orange">
                      you:{" "}
                      {row.pick === TIMED_OUT || row.pick === null
                        ? "no answer (clock)"
                        : row.question.options[row.pick]}
                      <span className="text-ink-dimmer"> · correct: </span>
                      <span className="text-brand">{row.question.options[row.question.correct]}</span>
                    </p>
                    <p className="mt-1.5 border-l-2 border-brand/40 pl-3 font-mono text-[12px] leading-relaxed text-ink-dim">
                      {row.question.derivation}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            {missed.length > 3 && (
              <p className="mt-2 font-mono text-[11.5px] text-ink-dimmer">
                +{missed.length - 3} more missed — the derivation for every one is
                on its question.
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <button
                type="button"
                onClick={restart}
                className="rounded-lg bg-brand px-8 py-3 text-[14px] font-semibold text-bg transition hover:bg-brand/90"
              >
                Run another round <span aria-hidden>→</span>
              </button>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">
                round {round + 1} is a different fixed deck
              </p>
            </div>
          </div>
        </section>
      )}

      <p className="mt-6 font-mono text-[10.5px] leading-relaxed text-ink-dimmer">
        params = in·out + out · KV = 2·L·Hkv·d·tokens·bytes · FLOPs = 2·P·tokens ·
        weights = P·bytes · GB = bytes / 1e9
      </p>
    </main>
  );
}
