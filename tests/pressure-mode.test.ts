import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STAGE_BUDGET_SECONDS,
  TIME_UP_NOTHING,
  TIME_UP_SUBMITTED,
  armKey,
  clockLevel,
  clockPercent,
  expiryOutcome,
  formatClock,
  pushbackProbe,
  secondsLeftAt,
  shouldRunClock,
  stageBudgetSeconds,
} from "../src/lib/interview/pressure";

// ── Budgets ──────────────────────────────────────────────────────────────

test("coding and ml_system stages get 90s", () => {
  assert.equal(stageBudgetSeconds("coding"), 90);
  assert.equal(stageBudgetSeconds("ml_system"), 90);
});

test("behavioural stages get 60s", () => {
  assert.equal(stageBudgetSeconds("behavioral"), 60);
});

test("unknown and absent kinds fall back to 90s rather than guessing", () => {
  assert.equal(stageBudgetSeconds(undefined), DEFAULT_STAGE_BUDGET_SECONDS);
  assert.equal(stageBudgetSeconds("system_design"), 90);
  assert.equal(stageBudgetSeconds("not_a_kind"), 90);
  assert.equal(DEFAULT_STAGE_BUDGET_SECONDS, 90);
});

// ── The clock face ───────────────────────────────────────────────────────

test("the countdown reads as m:ss", () => {
  assert.equal(formatClock(90), "1:30");
  assert.equal(formatClock(60), "1:00");
  assert.equal(formatClock(59), "0:59");
  assert.equal(formatClock(9), "0:09");
  assert.equal(formatClock(0), "0:00");
});

test("the countdown never renders a negative or fractional time", () => {
  assert.equal(formatClock(-5), "0:00");
  assert.equal(formatClock(59.9), "0:59");
  assert.equal(formatClock(Number.NaN), "0:00");
});

test("the bar shrinks from full to empty and clamps at both ends", () => {
  assert.equal(clockPercent(90, 90), 100);
  assert.equal(clockPercent(45, 90), 50);
  assert.equal(clockPercent(0, 90), 0);
  assert.equal(clockPercent(120, 90), 100);
  assert.equal(clockPercent(-10, 90), 0);
});

test("a zero or broken budget cannot produce a broken bar", () => {
  assert.equal(clockPercent(0, 0), 0);
  assert.equal(clockPercent(30, 0), 0);
  assert.equal(clockPercent(30, Number.NaN), 0);
  assert.equal(clockPercent(30, -90), 0);
});

test("the countdown starts at the full budget", () => {
  assert.equal(secondsLeftAt(1_000_000, 1_000_000, 90), 90);
  assert.equal(secondsLeftAt(1_000_000, 1_000_400, 90), 90);
});

test("the countdown reaches exactly zero and then stays there", () => {
  assert.equal(secondsLeftAt(0, 89_000, 90), 1);
  assert.equal(secondsLeftAt(0, 90_000, 90), 0);
  assert.equal(secondsLeftAt(0, 300_000, 90), 0);
  assert.equal(secondsLeftAt(0, 60_000, 60), 0);
});

test("a wall clock that jumps backwards cannot hand out free time", () => {
  assert.equal(secondsLeftAt(10_000, 5_000, 90), 90);
});

test("a broken budget expires instead of returning NaN", () => {
  assert.equal(secondsLeftAt(0, 1_000, 0), 0);
  assert.equal(secondsLeftAt(0, 1_000, Number.NaN), 0);
});

// ── Colour thresholds ────────────────────────────────────────────────────

test("the clock is calm at 20s and above", () => {
  assert.equal(clockLevel(90), "calm");
  assert.equal(clockLevel(20), "calm");
});

test("the clock turns amber under 20s", () => {
  assert.equal(clockLevel(19), "amber");
  assert.equal(clockLevel(10), "amber");
});

test("the clock turns red under 10s", () => {
  assert.equal(clockLevel(9), "red");
  assert.equal(clockLevel(0), "red");
});

// ── Expiry: the part that must never get it wrong ─────────────────────────

test("an empty box submits nothing and is counted as skipped", () => {
  const outcome = expiryOutcome("");
  assert.equal(outcome.action, "skip");
  assert.equal(outcome.note, TIME_UP_NOTHING);
  assert.equal(outcome.note, "time up — nothing submitted");
});

test("whitespace only is still an empty box", () => {
  assert.equal(expiryOutcome("   ").action, "skip");
  assert.equal(expiryOutcome("\n\t\n").action, "skip");
});

test("a partial answer is submitted as-is, not padded or corrected", () => {
  const outcome = expiryOutcome("  bounded keys, counting sort, O(n)  ");
  assert.equal(outcome.action, "submit");
  assert.equal(outcome.note, TIME_UP_SUBMITTED);
  assert.equal(outcome.note, "time up — submitted what you had");
});

// ── When the clock is allowed to run ─────────────────────────────────────

test("pressure runs only on a live stage with no review open", () => {
  assert.equal(shouldRunClock("pressure", true, false), true);
  assert.equal(shouldRunClock("pressure", false, false), false);
  assert.equal(shouldRunClock("pressure", true, true), false);
  assert.equal(shouldRunClock("practice", true, false), false);
});

test("a new stage arms a new clock, so nothing leaks across stages", () => {
  const first = armKey("pressure", "clarify", 90);
  const second = armKey("pressure", "approach", 90);
  assert.notEqual(first, second);
  assert.notEqual(armKey("pressure", "clarify", 90), armKey("pressure", "clarify", 60));
  assert.notEqual(armKey("pressure", "clarify", 90), armKey("practice", "clarify", 90));
  assert.equal(armKey("pressure", "clarify", 90), armKey("pressure", "clarify", 90));
});

// ── The simulated follow-up ──────────────────────────────────────────────

test("the pushback prefers the stage hint and strips its final punctuation", () => {
  assert.equal(pushbackProbe("What breaks at 10x traffic?", "production"), "What breaks at 10x traffic");
  assert.equal(pushbackProbe("You skipped the tie-break.", "clarify"), "You skipped the tie-break");
  assert.equal(pushbackProbe("Why not the simpler version!", "approach"), "Why not the simpler version");
});

test("a missing hint falls back to a probe for that stage", () => {
  assert.match(pushbackProbe("", "clarify"), /happy path/);
  assert.match(pushbackProbe("   ", "approach"), /simpler version/);
  assert.match(pushbackProbe("", "complexity"), /bound/);
  assert.match(pushbackProbe("", "production"), /traffic/);
});

test("an unknown stage with no hint still gets a usable probe", () => {
  assert.match(pushbackProbe("", "unknown_stage"), /number/);
});
