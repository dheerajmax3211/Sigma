/**
 * The review queue, as a list the profile can render.
 *
 * `mastery.ts` already computes SM-2 intervals (`recordReview`) and exposes a
 * strict `dueTopics` query for the dashboard, but nothing on the profile ever
 * showed the learner *which* topics were due — so the schedule existed and was
 * never surfaced. This module is that surface.
 *
 * The query is deliberately local-day based: a topic due at 18:00 is due
 * *today*, not tomorrow, and a topic due at 23:00 yesterday is one day late at
 * 09:00. Comparing raw ISO timestamps against `now` gets both cases wrong.
 */

import type Database from "better-sqlite3";

const DAY_MS = 86_400_000;

export interface DueTopic {
  topicId: string;
  title: string;
  summary: string | null;
  status: string;
  mastery: number;
  lastSeenAt: string | null;
  /** ISO timestamp of the next review, or null when never scheduled. */
  dueAt: string | null;
  /**
   * Whole calendar days past the due date. 0 = due today, null = the topic has
   * never been scheduled (touched once, never reviewed).
   */
  overdueDays: number | null;
  intervalDays: number | null;
}

export interface DueQueue {
  topics: DueTopic[];
  count: number;
}

/** Midnight at the start of the learner's local day. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The last millisecond of the learner's local day. */
function endOfLocalDay(d: Date): number {
  // Construct the boundary rather than adding 24h: on a DST-transition day a
  // fixed day length overruns into tomorrow evening.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** Whole calendar days between two instants, ignoring DST-length days. */
function calendarDaysBetween(aMs: number, bMs: number): number {
  const a = new Date(startOfLocalDay(new Date(aMs)));
  const b = new Date(startOfLocalDay(new Date(bMs)));
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * Everything the learner should review today: scheduled topics whose
 * `due_at` falls on or before today, plus topics that have progress but no
 * schedule row yet (touched, never reviewed — they are due by definition).
 *
 * Sorted the way a study session should run: most overdue first, then due
 * today, then never-reviewed topics by weakest mastery.
 */
export function dueForReview(
  db: Database.Database,
  learnerId: string,
  now = new Date(),
  limit = 50,
): DueQueue {
  const rows = db
    .prepare(
      `SELECT p.topic_id, p.status, p.mastery, p.last_seen_at,
              r.due_at, r.interval_days,
              t.title, t.summary
         FROM topic_progress p
         JOIN topic t ON t.id = p.topic_id
         LEFT JOIN review_schedule r
           ON r.learner_id = p.learner_id AND r.topic_id = p.topic_id
        WHERE p.learner_id = ?`,
    )
    .all(learnerId) as {
    topic_id: string;
    status: string;
    mastery: number;
    last_seen_at: string | null;
    due_at: string | null;
    interval_days: number | null;
    title: string;
    summary: string | null;
  }[];

  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  const due: DueTopic[] = [];
  for (const r of rows) {
    let overdueDays: number | null = null;

    if (r.due_at === null) {
      // Never scheduled: a topic with a progress row and no review row has
      // never been revisited, so it belongs in the queue.
      overdueDays = null;
    } else {
      const dueMs = new Date(r.due_at).getTime();
      if (Number.isNaN(dueMs)) {
        // An unparseable due date must not silently hide the topic.
        overdueDays = 0;
      } else if (dueMs <= todayEnd) {
        overdueDays = Math.max(0, calendarDaysBetween(dueMs, todayStart));
      } else {
        continue;
      }
    }

    due.push({
      topicId: r.topic_id,
      title: r.title,
      summary: r.summary,
      status: r.status,
      mastery: r.mastery,
      lastSeenAt: r.last_seen_at,
      dueAt: r.due_at,
      overdueDays,
      intervalDays: r.interval_days,
    });
  }

  due.sort((a, b) => {
    // Scheduled-overdue before never-scheduled.
    if (a.overdueDays === null && b.overdueDays !== null) return 1;
    if (b.overdueDays === null && a.overdueDays !== null) return -1;
    if (a.overdueDays !== null && b.overdueDays !== null && a.overdueDays !== b.overdueDays) {
      return b.overdueDays - a.overdueDays;
    }
    // Same urgency: weakest mastery first, then longest unseen.
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    return (a.lastSeenAt ?? "").localeCompare(b.lastSeenAt ?? "");
  });

  return { topics: due.slice(0, limit), count: due.length };
}
