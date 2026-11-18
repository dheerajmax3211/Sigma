/**
 * Progress and spaced repetition.
 *
 * `topic_progress` was read by the dashboard and written by nothing, so every
 * learner showed zero progress forever. This module is the writer.
 *
 * Two deliberate design choices:
 *
 * 1. **Mastery is computed from evidence, never asserted.** It is a weighted
 *    combination of problems passed, hints needed, and reviews survived —
 *    all deterministic, all inspectable. No model touches it.
 *
 * 2. **Mastery decays.** A number that only goes up is a number that lies.
 *    Effective mastery discounts the stored value by how overdue the topic is,
 *    using the SM-2 interval the scheduler itself produced.
 */

import type Database from "better-sqlite3";
import { newId } from "@/lib/util";

/** SM-2 constants. Floors matter: ease 1.3 is the standard lower bound. */
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;
/** Grade below this counts as a lapse. */
const LAPSE_GRADE = 3;

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export interface MasteryInputs {
  /** Problems in this topic that have been passed at least once. */
  problemsPassed: number;
  /** Problems declared in this topic. */
  problemsTotal: number;
  /** Highest hint tier revealed (0 = none, 5 = full solution). */
  hintTier: number;
  /** Self-check questions answered correctly. */
  checkpointsPassed: number;
  checkpointsTotal: number;
  /** Reviews survived without a lapse. */
  reviewsSurvived: number;
}

/**
 * Mastery in [0, 1] from evidence.
 *
 * Weights sum to 1. The hint-tier term is the interesting one: needing tier 5
 * does not zero the topic, but it caps mastery at 40% of the *problem* term,
 * because a learner who read the solution has not demonstrated the skill.
 */
export function computeMastery(i: MasteryInputs): number {
  const problemTerm =
    i.problemsTotal > 0 ? Math.min(1, i.problemsPassed / i.problemsTotal) : 0;

  // Tier 0 (no hints) = full credit, tier 5 (full solution) = 40%.
  const hintPenalty = Math.min(1, i.hintTier / 5);
  const independence = 1 - 0.6 * hintPenalty;

  const checkpointTerm =
    i.checkpointsTotal > 0 ? Math.min(1, i.checkpointsPassed / i.checkpointsTotal) : 0;

  // Reviews saturate: 3 successful reviews is full credit for that term.
  const reviewTerm = Math.min(1, i.reviewsSurvived / 3);

  const raw =
    0.5 * problemTerm * independence + 0.3 * checkpointTerm + 0.2 * reviewTerm;

  return Math.max(0, Math.min(1, Number(raw.toFixed(4))));
}

/** A topic counts as mastered only above this, with no outstanding problems. */
export const MASTERY_THRESHOLD = 0.75;

/**
 * Discount stored mastery by how overdue the review is.
 *
 * On time (or early): no discount. One interval late: 15% off. Two or more:
 * 35% off, floored, because a topic you have not touched in three intervals is
 * probably not as fresh as the stored number claims.
 */
export function decayMastery(mastery: number, dueAt: string | null, now = new Date()): number {
  if (!dueAt) return mastery;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return mastery;
  const lateMs = now.getTime() - due;
  if (lateMs <= 0) return mastery;
  const lateDays = lateMs / 86_400_000;
  const discount = lateDays >= 2 ? 0.35 : lateDays >= 1 ? 0.15 : 0;
  return Math.max(0, Number((mastery * (1 - discount)).toFixed(4)));
}

export interface Sm2Result {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  dueAt: string;
}

/**
 * One SM-2 step.
 *
 * Grade 0-2 is a lapse: the interval resets to 1 day and ease drops. Grade 3+
 * advances the interval by the ease factor. This is the classic algorithm, not
 * a variant — the point is that it is auditable and predictable.
 */
export function sm2(
  grade: Grade,
  prev: { intervalDays: number; ease: number; reps: number; lapses: number },
  now = new Date(),
): Sm2Result {
  let { intervalDays, ease, reps, lapses } = prev;

  // Ease update (SM-2 formula), applied on every grade.
  const q = grade;
  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < LAPSE_GRADE) {
    reps = 0;
    lapses += 1;
    intervalDays = 1;
  } else {
    reps += 1;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * ease));
  }

  // Cap at a year: beyond that the schedule is meaningless for a study app.
  intervalDays = Math.min(intervalDays, 365);

  const due = new Date(now.getTime() + intervalDays * 86_400_000);
  return {
    intervalDays,
    ease: Number(ease.toFixed(3)),
    reps,
    lapses,
    dueAt: due.toISOString(),
  };
}

/** Resolve or create the single local learner. */
export function ensureLearner(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM learner ORDER BY created_at LIMIT 1`).get() as
    | { id: string }
    | undefined;
  if (row) return row.id;
  const id = newId("lrn_");
  db.prepare(`INSERT INTO learner (id, display_name) VALUES (?, ?)`).run(id, "Learner");
  return id;
}

/** Read current progress row, or a zeroed default. */
export function readProgress(db: Database.Database, learnerId: string, topicId: string) {
  return (
    db
      .prepare(
        `SELECT status, mastery, attempts, last_seen_at, mastered_at
           FROM topic_progress WHERE learner_id = ? AND topic_id = ?`,
      )
      .get(learnerId, topicId) as
    | {
        status: string;
        mastery: number;
        attempts: number;
        last_seen_at: string | null;
        mastered_at: string | null;
      }
    | undefined
  );
}

/**
 * Record that a topic was engaged with, and recompute its mastery.
 *
 * Every write goes through here so mastery cannot be set by an ad-hoc UPDATE
 * somewhere else in the codebase. `inputs` is the full evidence set, not a
 * delta — that keeps the stored number reproducible from first principles.
 */
export function recordProgress(
  db: Database.Database,
  args: { learnerId: string; topicId: string; inputs: MasteryInputs },
): { mastery: number; status: string } {
  const now = new Date().toISOString();
  const mastery = computeMastery(args.inputs);
  const status =
    mastery >= MASTERY_THRESHOLD && args.inputs.problemsPassed >= args.inputs.problemsTotal
      ? "mastered"
      : "in_progress";

  db.prepare(
    `INSERT INTO topic_progress
       (id, learner_id, topic_id, status, mastery, attempts, last_seen_at, mastered_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(learner_id, topic_id) DO UPDATE SET
       status       = excluded.status,
       mastery      = excluded.mastery,
       attempts     = topic_progress.attempts + 1,
       last_seen_at = excluded.last_seen_at,
       mastered_at  = COALESCE(topic_progress.mastered_at, excluded.mastered_at)`,
  ).run(
    newId("prg_"),
    args.learnerId,
    args.topicId,
    status,
    mastery,
    now,
    status === "mastered" ? now : null,
  );

  return { mastery, status };
}

/**
 * Record a review and advance the schedule.
 *
 * Called when a learner returns to a due topic. The grade is derived from how
 * the session went, not asked for — a learner is not a reliable judge of their
 * own recall, and self-reported grades inflate the schedule.
 */
export function recordReview(
  db: Database.Database,
  args: { learnerId: string; topicId: string; grade: Grade },
): Sm2Result {
  const prev = db
    .prepare(
      `SELECT interval_days, ease, reps, lapses
         FROM review_schedule WHERE learner_id = ? AND topic_id = ?`,
    )
    .get(args.learnerId, args.topicId) as
    | { interval_days: number; ease: number; reps: number; lapses: number }
    | undefined;

  const next = sm2(args.grade, {
    intervalDays: prev?.interval_days ?? 0,
    ease: prev?.ease ?? DEFAULT_EASE,
    reps: prev?.reps ?? 0,
    lapses: prev?.lapses ?? 0,
  });

  db.prepare(
    `INSERT INTO review_schedule
       (id, learner_id, topic_id, due_at, interval_days, ease, reps, lapses, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(learner_id, topic_id) DO UPDATE SET
       due_at        = excluded.due_at,
       interval_days = excluded.interval_days,
       ease          = excluded.ease,
       reps          = excluded.reps,
       lapses        = excluded.lapses,
       updated_at    = excluded.updated_at`,
  ).run(
    newId("rev_"),
    args.learnerId,
    args.topicId,
    next.dueAt,
    next.intervalDays,
    next.ease,
    next.reps,
    next.lapses,
  );

  return next;
}

/** What should the learner study today? Strictly due topics, earliest first. */
export function dueTopics(db: Database.Database, learnerId: string, limit = 8) {
  const now = new Date().toISOString();
  return db
    .prepare(
      `SELECT p.topic_id, p.status, p.mastery, p.last_seen_at,
              r.due_at, r.interval_days, r.reps, r.lapses,
              t.title, t.summary
         FROM topic_progress p
         JOIN topic t ON t.id = p.topic_id
         LEFT JOIN review_schedule r
           ON r.learner_id = p.learner_id AND r.topic_id = p.topic_id
        WHERE p.learner_id = ?
          AND (r.due_at IS NULL OR r.due_at <= ?)
        ORDER BY (r.due_at IS NULL) ASC, p.mastery ASC
        LIMIT ?`,
    )
    .all(learnerId, now, limit) as ProgressRow[];
}

/**
 * What to show on the dashboard: overdue first, then scheduled, then recent.
 *
 * `dueTopics` is the review queue and is deliberately strict — a topic due
 * tomorrow is not due today. A dashboard band is a different question ("where
 * was I?"), so it includes scheduled topics and orders by urgency rather than
 * excluding them. Conflating the two leaves the dashboard empty for anyone who
 * is on schedule, which is most of the time.
 */
export function nextUp(db: Database.Database, learnerId: string, limit = 3) {
  const now = new Date().toISOString();
  return db
    .prepare(
      `SELECT p.topic_id, p.status, p.mastery, p.last_seen_at,
              r.due_at, r.interval_days, r.reps, r.lapses,
              t.title, t.summary,
              CASE
                WHEN r.due_at IS NULL THEN 1
                WHEN r.due_at <= ? THEN 0
                ELSE 2
              END AS urgency
         FROM topic_progress p
         JOIN topic t ON t.id = p.topic_id
         LEFT JOIN review_schedule r
           ON r.learner_id = p.learner_id AND r.topic_id = p.topic_id
        WHERE p.learner_id = ?
        ORDER BY urgency ASC, p.last_seen_at DESC
        LIMIT ?`,
    )
    .all(now, learnerId, limit) as ProgressRow[];
}

interface ProgressRow {
  topic_id: string;
  status: string;
  mastery: number;
  last_seen_at: string | null;
  due_at: string | null;
  interval_days: number | null;
  reps: number | null;
  lapses: number | null;
  title: string;
  summary: string;
}
