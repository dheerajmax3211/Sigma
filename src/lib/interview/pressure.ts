/**
 * Pressure-mode rules for the mock interview.
 *
 * Deliberately pure and React-free: the budget, the colour thresholds and the
 * decision of what to do when the clock hits zero are the parts that can be
 * wrong in ways a human will not notice until they are mid-interview, so they
 * are testable without a browser, a timer or a network.
 */

export type TimingMode = "practice" | "pressure";

/** Fallback when the question kind is unknown or absent. */
export const DEFAULT_STAGE_BUDGET_SECONDS = 90;

/** The budget choices the interview offers as an override. */
export const STAGE_BUDGET_CHOICES_SECONDS = [60, 90, 120] as const;

/**
 * Budget for one stage, from the question's kind.
 *
 * Coding and ML-system rounds get 90s because the answer is a design walk;
 * behavioural gets 60s because a good answer is a story, not a spec. Anything
 * unknown (including system_design) falls back to 90s rather than guessing.
 *
 * An explicit override — the learner picked 60/90/120 — wins over the kind,
 * because the point of the control is to rehearse a different clock. Invalid
 * overrides (zero, negative, NaN) fall back to the per-kind budget instead of
 * producing a clock that can never run.
 */
export function stageBudgetSeconds(kind?: string, overrideSeconds?: number | null): number {
  if (
    typeof overrideSeconds === "number" &&
    Number.isFinite(overrideSeconds) &&
    overrideSeconds > 0
  ) {
    return Math.round(overrideSeconds);
  }
  if (kind === "behavioral") return 60;
  if (kind === "coding" || kind === "ml_system") return DEFAULT_STAGE_BUDGET_SECONDS;
  return DEFAULT_STAGE_BUDGET_SECONDS;
}

/** `m:ss` — 90 becomes `1:30`, 9 becomes `0:09`. */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export type ClockLevel = "calm" | "amber" | "red";

/** Amber under 20s, red under 10s — the boundary values stay at the calmer level. */
export function clockLevel(secondsLeft: number): ClockLevel {
  if (secondsLeft < 10) return "red";
  if (secondsLeft < 20) return "amber";
  return "calm";
}

/** Width of the countdown bar, 0–100. Never divides by a zero budget. */
export function clockPercent(secondsLeft: number, budget: number): number {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  const pct = Math.round((secondsLeft / budget) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * Whole seconds left, from a wall-clock start stamp.
 *
 * The interval in the component only reads the clock; it never subtracts, so a
 * throttled tab cannot make the countdown drift. Clamped at zero because zero
 * is the signal that fires the submit — a negative value would never compare
 * equal to it.
 */
export function secondsLeftAt(startedAtMs: number, nowMs: number, budget: number): number {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  const elapsed = Math.floor(Math.max(0, nowMs - startedAtMs) / 1000);
  return Math.max(0, budget - elapsed);
}

/** Stage ids are generic, so a missing hint falls back to what the stage asks. */
const GENERIC_PROBES: Record<string, string> = {
  clarify: "you assumed the happy path — what breaks first?",
  approach: "that works, but why not the simpler version?",
  complexity: "that bound looks optimistic — where does it stop holding?",
  production: "now it carries ten times the traffic — what falls over first?",
};

const FALLBACK_PROBE = "say that again, but with a number in it";

/**
 * The pushback line. The stage hint is already written as the thing an
 * interviewer would needle you about, so it is preferred; trailing punctuation
 * is stripped so the quoted sentence does not end in `.".`
 */
export function pushbackProbe(hint: string, stageId: string): string {
  const trimmed = hint.trim().replace(/[.!?]+$/, "");
  if (trimmed) return trimmed;
  return GENERIC_PROBES[stageId] ?? FALLBACK_PROBE;
}

export const TIME_UP_SUBMITTED = "time up — submitted what you had";
export const TIME_UP_NOTHING = "time up — nothing submitted";

export type ExpiryOutcome =
  | { action: "submit"; note: typeof TIME_UP_SUBMITTED }
  | { action: "skip"; note: typeof TIME_UP_NOTHING };

/**
 * What the clock does at zero.
 *
 * Whitespace is not an answer: an empty box must never reach the API, because a
 * blank turn would be scored as a real attempt.
 */
export function expiryOutcome(answer: string): ExpiryOutcome {
  if (!answer.trim()) return { action: "skip", note: TIME_UP_NOTHING };
  return { action: "submit", note: TIME_UP_SUBMITTED };
}

/**
 * The clock runs only in pressure mode, on a live stage, before the review.
 * Once the rubric is open the answer is already recorded, so a tick would be
 * counting down against nothing.
 */
export function shouldRunClock(
  mode: TimingMode,
  hasStage: boolean,
  hasReview: boolean,
): boolean {
  return mode === "pressure" && hasStage && !hasReview;
}

/**
 * Identity of the armed stage. A changed key is what makes the reset effect
 * fire — i.e. moving to another stage cannot inherit the previous clock or a
 * stale "time up" line.
 */
export function armKey(mode: TimingMode, stageId: string, budget: number): string {
  return `${mode}:${stageId}:${budget}`;
}
