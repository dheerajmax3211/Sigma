import type { Database } from "better-sqlite3";

/**
 * Achievements, derived rather than stored.
 *
 * A table of unlocked badges is a second source of truth that drifts the moment
 * a progress row changes. Every badge here is a predicate over data the app
 * already keeps, so it cannot get out of sync and there is no migration to run.
 *
 * Streaks are computed in local calendar days from `topic_progress.last_seen_at`
 * and `interview_session.created_at`, not from a counter that a missed midnight
 * can silently reset.
 */
export interface Achievement {
  id: string;
  title: string;
  /** What the learner did to earn it. */
  requirement: string;
  unlocked: boolean;
  /** Progress toward the requirement, 0..1 — shown when locked. */
  progress: number;
}

export interface ProfileStats {
  topicsTouched: number;
  topicsMastered: number;
  streakDays: number;
  interviewsCompleted: number;
  bestInterviewScore: number | null;
  averageInterviewScore: number | null;
  problemsRun: number;
  problemsPassed: number;
  achievements: Achievement[];
  perTrack: { trackId: string; touched: number; mastered: number; total: number }[];
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function streakFrom(dates: string[]): number {
  const days = new Set(
    dates
      .map((s) => new Date(s))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map(dayKey),
  );
  if (days.size === 0) return 0;

  // Walk backwards from today. A streak survives if the learner studied today
  // or yesterday — studying "last night" should not read as a broken streak at
  // 09:00.
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const ratio = (n: number, target: number) => Math.min(1, target === 0 ? 1 : n / target);

export function buildProfile(db: Database, learnerId: string): ProfileStats {
  const progress = db
    .prepare(
      `SELECT p.topic_id, p.status, p.mastery, p.last_seen_at, t.track_id, t.title
         FROM topic_progress p LEFT JOIN topic t ON t.id = p.topic_id
        WHERE p.learner_id = ?`,
    )
    .all(learnerId) as {
    topic_id: string;
    status: string;
    mastery: number;
    last_seen_at: string | null;
    track_id: string | null;
    title: string | null;
  }[];

  const interviews = db
    .prepare(
      `SELECT overall_score, created_at FROM interview_session
        WHERE learner_id = ? AND status = 'completed'`,
    )
    .all(learnerId) as { overall_score: number | null; created_at: string }[];

  // `execution` has no learner_id and no boolean `passed` column — it records a
  // status and per-case results. Counting rows whose status is `ok` is the
  // honest thing to claim here ("ran cleanly"), not "passed the tests".
  const runs = db
    .prepare(`SELECT status FROM execution`)
    .all() as { status: string }[];

  const trackTotals = db
    .prepare(`SELECT track_id, COUNT(*) AS n FROM topic GROUP BY track_id`)
    .all() as { track_id: string; n: number }[];

  const topicsMastered = progress.filter((p) => p.status === "mastered").length;
  const problemsRun = runs.length;
  const problemsPassed = runs.filter((r) => r.status === "ok").length;

  const scores = interviews
    .map((i) => i.overall_score)
    .filter((s): s is number => typeof s === "number");
  const best = scores.length ? Math.max(...scores) : null;
  const average = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;

  const streakDays = streakFrom([
    ...progress.map((p) => p.last_seen_at).filter((s): s is string => Boolean(s)),
    ...interviews.map((i) => i.created_at),
  ]);

  const perTrack = trackTotals.map((t) => ({
    trackId: t.track_id,
    total: t.n,
    touched: progress.filter((p) => p.track_id === t.track_id).length,
    mastered: progress.filter((p) => p.track_id === t.track_id && p.status === "mastered").length,
  }));

  const achievements: Achievement[] = [
    {
      id: "first-contact",
      title: "First contact",
      requirement: "Open your first topic",
      unlocked: progress.length >= 1,
      progress: ratio(progress.length, 1),
    },
    {
      id: "ten-topics",
      title: "Ten deep",
      requirement: "Study 10 topics",
      unlocked: progress.length >= 10,
      progress: ratio(progress.length, 10),
    },
    {
      id: "streak-7",
      title: "Seven-day streak",
      requirement: "Study seven days in a row",
      unlocked: streakDays >= 7,
      progress: ratio(streakDays, 7),
    },
    {
      id: "first-mastery",
      title: "Something sticks",
      requirement: "Master your first topic",
      unlocked: topicsMastered >= 1,
      progress: ratio(topicsMastered, 1),
    },
    {
      id: "track-complete",
      title: "Track cleared",
      requirement: "Master every topic in one track",
      unlocked: perTrack.some((t) => t.total > 0 && t.mastered === t.total),
      progress: Math.max(
        0,
        ...perTrack.filter((t) => t.total > 0).map((t) => t.mastered / t.total),
      ),
    },
    {
      id: "first-interview",
      title: "In the chair",
      requirement: "Finish one mock interview",
      unlocked: interviews.length >= 1,
      progress: ratio(interviews.length, 1),
    },
    {
      id: "five-interviews",
      title: "Five rounds",
      requirement: "Finish five mock interviews",
      unlocked: interviews.length >= 5,
      progress: ratio(interviews.length, 5),
    },
    {
      id: "score-70",
      title: "Hireable",
      requirement: "Score 70 or above in a mock interview",
      unlocked: (best ?? 0) >= 70,
      progress: ratio(best ?? 0, 70),
    },
    {
      id: "hundred-runs",
      title: "Hundred runs",
      requirement: "Run code 100 times",
      unlocked: problemsRun >= 100,
      progress: ratio(problemsRun, 100),
    },
  ];

  return {
    topicsTouched: progress.length,
    topicsMastered,
    streakDays,
    interviewsCompleted: interviews.length,
    bestInterviewScore: best,
    averageInterviewScore: average,
    problemsRun,
    problemsPassed,
    achievements,
    perTrack,
  };
}
