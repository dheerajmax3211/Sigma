import { getContent } from "@/lib/content/loader";
import { getDb } from "@/lib/db";
import { ensureLearner, nextUp } from "@/lib/progress/mastery";
import {
  RoadmapExplorer,
  type ExplorerEdge,
  type ExplorerNode,
  type ExplorerTrack,
} from "@/components/RoadmapExplorer";
import type { Track } from "@/lib/content/schema";

export const dynamic = "force-dynamic";

/**
 * The roadmap, as a plan rather than a picture.
 *
 * The previous version rendered every topic and every prerequisite edge in one
 * static SVG. It was 3,500px wide and completely unreadable: a wall of 101
 * boxes that told a learner nothing about where to start. The page now opens
 * with the only question that matters — which milestone am I on, and what is
 * the next single topic — and keeps the dependency graph available but
 * collapsed, for the moment someone actually wants to trace a prerequisite.
 */

/** One plain-language line per track. What this actually buys you in a loop. */
const INTERVIEW_RELEVANCE: Record<string, string> = {
  foundations: "Unlocks the maths screen — derivations, not definitions.",
  "core-ml": "Unlocks the classic-ML round: bias–variance, calibration, leakage.",
  "deep-learning": "Unlocks training-dynamics questions: vanishing gradients, init, norms.",
  transformers: "Unlocks the LLM systems round: attention cost, KV cache, serving.",
  vision: "Unlocks the multimodal round: patches, CLIP, diffusion.",
  distributed: "Unlocks training-at-scale: parallelism, all-reduce, scaling efficiency.",
  staff: "Unlocks system design — capacity arithmetic you can defend.",
  audio: "Unlocks the speech round: codecs, ASR alignment, latency budgets.",
  build: "Unlocks the live coding screen: you have already built the thing.",
};

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

interface TrackProgress {
  /** Rows that exist at all — the learner has engaged with the topic. */
  touched: number;
  /** Rows whose status is `mastered`. */
  mastered: number;
}

/** Topics for a track, tolerant of both the id and the slug key. */
function topicsForTrack(content: ReturnType<typeof getContent>, track: Track) {
  return (
    content.topicsByTrack.get(track.id) ??
    content.topicsByTrack.get(track.slug.replace(/^\d+-/, "")) ??
    []
  );
}

/**
 * Progress per track.
 *
 * `topic_progress` is keyed by topic, not by track, so "progress for this
 * track" is the same question asked through the topic table: rows whose
 * `topic.track_id` is the track. Every failure mode here — missing database,
 * unseeded topic table, no learner yet — degrades to zero rather than taking
 * the page down. A roadmap that cannot render because progress is unavailable
 * is worse than a roadmap showing no progress.
 */
function readTrackProgress(): { byTrack: Map<string, TrackProgress>; learnerId: string | null } {
  const byTrack = new Map<string, TrackProgress>();
  let learnerId: string | null = null;

  try {
    const db = getDb();
    learnerId = ensureLearner(db);
    const rows = db
      .prepare(
        `SELECT t.track_id                                   AS track_id,
                COUNT(*)                                     AS touched,
                COALESCE(SUM(CASE WHEN p.status = 'mastered'
                                  THEN 1 ELSE 0 END), 0)      AS mastered
           FROM topic_progress p
           JOIN topic t ON t.id = p.topic_id
          WHERE p.learner_id = ?
          GROUP BY t.track_id`,
      )
      .all(learnerId) as { track_id: string; touched: number; mastered: number }[];

    for (const row of rows) {
      byTrack.set(row.track_id, { touched: row.touched, mastered: row.mastered });
    }
  } catch {
    // Empty or unavailable database: every track reads as not started.
  }

  return { byTrack, learnerId };
}

/** The single next thing to do, or the top of the curriculum on a cold start. */
function readNextAction(
  content: ReturnType<typeof getContent>,
  learnerId: string | null,
): { topicId: string; title: string; minutes: number } | null {
  if (learnerId) {
    try {
      const db = getDb();
      const first = nextUp(db, learnerId, 1)[0];
      if (first?.topic_id) {
        return {
          topicId: first.topic_id,
          title: first.title,
          minutes: content.topicsById.get(first.topic_id)?.estMinutes ?? 30,
        };
      }
    } catch {
      // fall through to the first topic of the first track
    }
  }

  for (const track of content.tracks) {
    const first = topicsForTrack(content, track)[0];
    if (first) return { topicId: first.id, title: first.title, minutes: first.estMinutes };
  }
  return null;
}

export default async function RoadmapPage() {
  const content = getContent();

  const totalTopics = content.topics.length;

  const { byTrack, learnerId } = readTrackProgress();
  const nextAction = readNextAction(content, learnerId);

  // A serialisable payload for the client graph: no Maps, no class instances.
  const explorerNodes: ExplorerNode[] = [];
  const explorerTracks: ExplorerTrack[] = [];
  for (const track of content.tracks) {
    const topics = topicsForTrack(content, track);
    if (topics.length === 0) continue;
    explorerTracks.push({ id: track.id, title: track.title, color: track.color });
    for (const topic of topics) {
      explorerNodes.push({
        id: topic.id,
        title: topic.title,
        trackId: track.id,
        color: track.color,
        position: topic.position,
      });
    }
  }

  const known = new Set(content.topics.map((t) => t.id));
  const seen = new Set<string>();
  const explorerEdges: ExplorerEdge[] = [];
  for (const topic of content.topics) {
    for (const prerequisite of topic.prerequisites ?? []) {
      if (!known.has(prerequisite) || !known.has(topic.id)) continue;
      const key = `${prerequisite}->${topic.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      explorerEdges.push({ from: prerequisite, to: topic.id });
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-10">
      <header className="mb-8">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
          Milestones
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">
          Your path, in {numberWord(content.tracks.length)} milestones
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
          {content.tracks.length} stops, {totalTopics} topics. You only ever need the next one —
          find the milestone you are on, and go from there.
        </p>
      </header>

      {/* ── Next best action ─────────────────────────────────────────────
             One topic, chosen for you. The roadmap's job is to remove the
             decision, not to present all of them at once. ─────────────── */}
      {nextAction && (
        <section
          aria-label="Next on your path"
          className="mb-10 overflow-hidden rounded-2xl border border-brand/25 bg-brand/[0.055]"
        >
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                Next on your path
              </p>
              <p className="mt-1.5 text-[17px] font-semibold tracking-tight text-fg">
                {nextAction.title}{" "}
                <span className="whitespace-nowrap font-mono text-[12px] font-normal text-ink-dimmer">
                  (~{nextAction.minutes} min)
                </span>
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-dim">
                One topic. Then the next one.
              </p>
            </div>
            <a
              href={`/topic/${nextAction.topicId}`}
              className="group inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-bg transition hover:brightness-110 sm:self-auto"
            >
              Start now
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </a>
          </div>
        </section>
      )}

      {/* ── Milestones ─────────────────────────────────────────────────── */}
      <section aria-label="Milestones">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
            {content.tracks.length} milestones, in order
          </h2>
          <span className="hidden font-mono text-[10.5px] text-ink-dimmer sm:block">
            tier 0 is the floor · tier 5 is staff-level
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {content.tracks.map((track, index) => {
            const topics = topicsForTrack(content, track);
            const minutes = topics.reduce((n, t) => n + t.estMinutes, 0);
            const hours = Math.round(minutes / 60);
            const progress = byTrack.get(track.id) ?? { touched: 0, mastered: 0 };
            const total = topics.length;
            const pct = total > 0 ? Math.round((progress.mastered / total) * 100) : 0;
            const startedPct = total > 0 ? Math.round((progress.touched / total) * 100) : 0;

            const cta =
              total === 0
                ? null
                : progress.touched === 0
                  ? { label: "Start", filled: true }
                  : progress.mastered >= total
                    ? { label: "Review", filled: false }
                    : { label: "Continue", filled: true };

            return (
              <article
                key={track.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 transition hover:border-line-2 hover:bg-surface-2"
              >
                {/* Coloured accent bar, the track's own colour. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: track.color }}
                />

                <div className="flex flex-1 flex-col p-5 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
                        Milestone {String(index + 1).padStart(2, "0")} · tier {track.tier}
                      </p>
                      <h3 className="mt-1.5 text-[16.5px] font-semibold leading-snug tracking-tight text-fg">
                        <a href={`/track/${track.slug}`} className="transition hover:text-brand">
                          {track.title}
                        </a>
                      </h3>
                    </div>
                    <ProgressRing
                      pct={pct}
                      color={track.color}
                      label={`${progress.mastered} of ${total} topics mastered`}
                    />
                  </div>

                  {track.subtitle && (
                    <p
                      className="mt-1.5 font-mono text-[11px] leading-relaxed"
                      style={{ color: track.color }}
                    >
                      {track.subtitle}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                    <span>
                      {total} topic{total === 1 ? "" : "s"}
                    </span>
                    <span aria-hidden>·</span>
                    <span>~{hours} h</span>
                    <span aria-hidden>·</span>
                    <span>
                      {progress.mastered} mastered
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-ink-dimmer">
                      <span>
                        {progress.touched} of {total} started
                      </span>
                      <span>{startedPct}%</span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-surface-4"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={startedPct}
                      aria-label={`${track.title} started`}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${startedPct}%`, background: track.color }}
                      />
                    </div>
                  </div>

                  <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-dim">
                    <span
                      aria-hidden
                      className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: track.color }}
                    />
                    <span>
                      {INTERVIEW_RELEVANCE[track.id] ??
                        "Builds interview-grade depth in a subject you will be asked about."}
                    </span>
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                      {total === 1 ? "1 topic" : `${total} topics`}
                    </span>
                    {cta ? (
                      <a
                        href={`/track/${track.slug}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                          cta.filled
                            ? "bg-brand text-bg hover:brightness-110"
                            : "border border-brand-violet/40 bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20"
                        }`}
                      >
                        {cta.label}
                        <span aria-hidden>→</span>
                      </a>
                    ) : (
                      <span className="font-mono text-[11px] text-ink-dimmer">in preparation</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── The graph, collapsed ─────────────────────────────────────────
             Optional by design. It is the same information as the cards,
             at a different altitude, and it earns its place only when the
             learner asks a specific "what needs what" question. ──────── */}
      <details className="group mt-12 overflow-hidden rounded-2xl border border-line bg-surface-1">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 font-mono text-[12px] text-ink-dim transition group-open:rotate-90"
          >
            ▸
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-fg">
              Explore the dependencies
            </span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-dimmer">
              Optional. What each topic needs first, and what it unlocks. Hover one topic to
              light up just its path.
            </span>
          </span>
          <span className="hidden shrink-0 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer sm:block">
            {explorerNodes.length} topics · {explorerEdges.length} links
          </span>
        </summary>

        <div className="border-t border-line p-3">
          <RoadmapExplorer
            nodes={explorerNodes}
            edges={explorerEdges}
            tracks={explorerTracks}
          />
        </div>
      </details>

      <p className="mt-6 font-mono text-[11px] text-ink-dimmer">
        Progress is stored on this machine. Nothing here is sent anywhere.
      </p>
    </div>
  );
}

/** A mastered-count ring. The number inside is the percentage mastered. */
function ProgressRing({
  pct,
  color,
  label,
}: {
  pct: number;
  color: string;
  label: string;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * circumference;

  return (
    <div className="relative grid h-11 w-11 shrink-0 place-items-center" title={label}>
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={radius} fill="none" stroke="#ffffff14" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <span className="absolute font-mono text-[9.5px] font-semibold text-fg">{pct}%</span>
    </div>
  );
}
