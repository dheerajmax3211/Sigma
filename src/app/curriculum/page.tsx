import { getContent } from "@/lib/content/loader";
import { getDb } from "@/lib/db";
import { HINT_TIERS } from "@/lib/coach/tiers";
import { decayMastery, nextUp } from "@/lib/progress/mastery";

export const dynamic = "force-dynamic";

const TRACK_BLURB: Record<string, string> = {
  foundations:
    "Linear algebra, probability, optimisation and the numerics that separate a working model from a working idea.",
  "core-ml": "Classical models built from scratch — regression, trees, ensembles, kernels, evaluation.",
  "deep-learning": "Networks from first principles: autograd, backprop, CNNs, RNNs, and optimisation that actually converges.",
  transformers: "Attention, transformers, tokenisation, decoding, fine-tuning, and efficient inference.",
  "vision-multimodal": "ViT, CLIP, diffusion models, and the multimodal architectures behind them.",
  "distributed-mlops": "DDP, FSDP, ZeRO, tensor/pipeline parallelism, serving engines, quantization, custom kernels.",
  "staff": "System design at scale, research judgement, and the Staff/Principal MLE question bank.",
};

export default function Home() {
  const content = getContent();
  const db = getDb();

  const learner = db
    .prepare(`SELECT id, display_name FROM learner ORDER BY created_at LIMIT 1`)
    .get() as { id: string; display_name: string | null } | undefined;

  const progress = learner
    ? (db
        .prepare(
          `SELECT status, COUNT(*) AS n FROM topic_progress WHERE learner_id = ? GROUP BY status`,
        )
        .all(learner.id) as { status: string; n: number }[])
    : [];

  const mastered = progress.find((p) => p.status === "mastered")?.n ?? 0;
  const inProgress = progress.find((p) => p.status === "in_progress")?.n ?? 0;

  // Effective mastery, not the stored number: a topic earned two intervals ago
  // is no longer as fresh as its stored score claims.
  const rows = learner
    ? (db
        .prepare(
          `SELECT p.mastery, r.due_at
             FROM topic_progress p
             LEFT JOIN review_schedule r
               ON r.learner_id = p.learner_id AND r.topic_id = p.topic_id
            WHERE p.learner_id = ?`,
        )
        .all(learner.id) as { mastery: number; due_at: string | null }[])
    : [];
  const meanMastery =
    rows.length > 0
      ? rows.reduce((n, r) => n + decayMastery(r.mastery, r.due_at), 0) / rows.length
      : 0;

  // Due-first, then scheduled, then recent — a strict due filter leaves the
  // band empty for anyone who is on schedule.
  const due = learner ? nextUp(db, learner.id, 3) : [];

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mb-12">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-brand">
          The Ultimate AI, ML &amp; Deep Learning Mastery Platform
        </p>
        <h1 className="max-w-4xl text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.025em] text-fg">
          Learn the mathematics properly.
          <br />
          <span className="text-ink-dim">Then build the systems that use it.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
          Every topic carries a full derivation, a from-scratch implementation,
          deterministic complexity analysis, and a five-tier hint ladder. A coach
          that works with no API key. Everything runs on your machine.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a
            href="/learn"
            className="group inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-bg transition hover:brightness-110"
          >
            Start the 8-week path
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </a>
          <a
            href="/start"
            className="inline-flex items-center gap-2 rounded-xl border border-brand/35 bg-brand/[0.06] px-4 py-2.5 text-[13.5px] font-medium text-brand transition hover:bg-brand/[0.12]"
          >
            Set up your path
          </a>
          <a
            href="/lab"
            className="inline-flex items-center gap-2 rounded-xl border border-line-2 bg-surface-1 px-4 py-2.5 text-[13.5px] font-medium text-fg transition hover:bg-surface-2"
          >
            Open the execution lab
          </a>
          <span className="font-mono text-[11.5px] text-ink-dimmer">
            {content.topics.length} topic{content.topics.length === 1 ? "" : "s"} ·{" "}
            {content.tracks.length} track{content.tracks.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      {due.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
              Pick up where you left off
            </h2>
            <span className="font-mono text-[10.5px] text-ink-dimmer">
              mean effective mastery {(meanMastery * 100).toFixed(0)}%
            </span>
          </div>
          <div className="grid gap-2.5 md:grid-cols-3">
            {due.map((d) => (
              <a
                key={d.topic_id}
                href={`/topic/${d.topic_id}`}
                className="group rounded-xl border border-line bg-surface-1 p-4 transition hover:border-line-2 hover:bg-surface-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-medium text-fg">{d.title}</span>
                  <span
                    className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${
                      d.due_at && new Date(d.due_at) <= new Date()
                        ? "bg-brand-orange/15 text-brand-orange"
                        : "bg-surface-3 text-ink-dimmer"
                    }`}
                  >
                    {d.due_at ? (new Date(d.due_at) <= new Date() ? "due" : "scheduled") : "new"}
                  </span>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-4">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round(d.mastery * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[10px] text-ink-dimmer">
                  {(d.mastery * 100).toFixed(0)}% mastery
                  {d.reps ? ` · ${d.reps} review${d.reps === 1 ? "" : "s"}` : ""}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <section className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Topics" value={String(content.topics.length)} accent="text-brand" />
        <Stat label="In progress" value={String(inProgress)} accent="text-brand-orange" />
        <Stat label="Mastered" value={String(mastered)} accent="text-brand-violet" />
        <Stat label="Hint tiers" value={String(HINT_TIERS.length)} accent="text-brand-sky" />
      </section>

      {/* ── Tracks ───────────────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
          Curriculum
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {content.tracks.map((track) => {
            const topics = content.topicsByTrack.get(track.slug.replace(/^\d+-/, "")) ?? [];
            return (
              <a
                key={track.id}
                href={`/track/${track.slug.replace(/^\d+-/, "")}`}
                className="group rounded-2xl border border-line bg-surface-1 p-5 transition hover:border-line-2 hover:bg-surface-2"
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: track.color, boxShadow: `0 0 10px ${track.color}80` }}
                  />
                  <h3 className="text-[16px] font-semibold tracking-tight text-fg">{track.title}</h3>
                  <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                    tier {track.tier}
                  </span>
                </div>
                {track.subtitle && (
                  <p className="mb-2 font-mono text-[11.5px] text-brand/80">{track.subtitle}</p>
                )}
                <p className="mb-4 text-[13.5px] leading-relaxed text-ink-dim">
                  {TRACK_BLURB[track.slug.replace(/^\d+-/, "")] ?? track.description ?? ""}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {topics.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className="rounded-md border border-line bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-ink-dim"
                    >
                      {t.title.length > 34 ? `${t.title.slice(0, 34)}…` : t.title}
                    </span>
                  ))}
                  {topics.length === 0 && (
                    <span className="font-mono text-[11px] text-ink-dimmer">in preparation</span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* ── Three ways in ─────────────────────────────────────────────────
             A landing page answers one question: where do I start? The full
             catalogue lives at /tracks — putting 78 topics here turned the
             front door into a scroll (5,487 visible words). ────────────── */}
      <section>
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
          Start somewhere
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <a
            href="/track/foundations"
            className="group rounded-2xl border border-line bg-surface-1 p-5 transition hover:border-brand/40"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand">
              From zero
            </div>
            <div className="mt-2 text-[15px] font-semibold text-fg">
              Start at the mathematical floor
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
              Vectors, matrix calculus, probability, optimisation. The track
              everything else assumes you finished.
            </p>
          </a>
          <a
            href="/interview"
            className="group rounded-2xl border border-line bg-surface-1 p-5 transition hover:border-brand-orange/40"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand-orange">
              Interview soon
            </div>
            <div className="mt-2 text-[15px] font-semibold text-fg">
              Rehearse the questions
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
              Staged mock interviews with rubrics and scoring — the round most
              candidates lose without ever practising.
            </p>
          </a>
          <a
            href="/notes"
            className="group rounded-2xl border border-line bg-surface-1 p-5 transition hover:border-brand-violet/40"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand-violet">
              How it is built
            </div>
            <div className="mt-2 text-[15px] font-semibold text-fg">
              Case studies of real systems
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
              How Kimi K3, ChatGPT, and Claude were actually trained and
              served — with the capacity arithmetic.
            </p>
          </a>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <a
            href="/tracks"
            className="font-mono text-[11.5px] text-brand transition hover:text-brand/80"
          >
            Browse all {content.topics.length} topics →
          </a>
          <span className="font-mono text-[11px] text-ink-dimmer">
            {content.tracks.length} tracks · {content.topics.length} topics
          </span>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 px-4 py-3.5">
      <div className={`font-mono text-[22px] font-bold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">
        {label}
      </div>
    </div>
  );
}
