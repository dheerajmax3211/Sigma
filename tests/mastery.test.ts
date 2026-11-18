import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MASTERY_THRESHOLD,
  computeMastery,
  decayMastery,
  sm2,
} from "../src/lib/progress/mastery.ts";

const base = {
  problemsPassed: 0,
  problemsTotal: 0,
  hintTier: 0,
  checkpointsPassed: 0,
  checkpointsTotal: 0,
  reviewsSurvived: 0,
};

test("no evidence means no mastery", () => {
  assert.equal(computeMastery(base), 0);
});

test("a perfect run with no hints is full mastery", () => {
  const m = computeMastery({
    ...base,
    problemsPassed: 3,
    problemsTotal: 3,
    checkpointsPassed: 6,
    checkpointsTotal: 6,
    reviewsSurvived: 3,
  });
  assert.equal(m, 1);
});

test("needing the tier-5 solution caps the problem credit at 40%", () => {
  const noHint = computeMastery({ ...base, problemsPassed: 3, problemsTotal: 3, hintTier: 0 });
  const fullSolution = computeMastery({ ...base, problemsPassed: 3, problemsTotal: 3, hintTier: 5 });
  assert.equal(noHint, 0.5);
  // 0.5 * (1 - 0.6) = 0.2 — reading the answer is not demonstrating the skill.
  assert.equal(fullSolution, 0.2);
});

test("partial problems scale linearly", () => {
  const half = computeMastery({ ...base, problemsPassed: 1, problemsTotal: 2, hintTier: 0 });
  assert.equal(half, 0.25);
});

test("reviews saturate at three", () => {
  const three = computeMastery({ ...base, reviewsSurvived: 3 });
  const nine = computeMastery({ ...base, reviewsSurvived: 9 });
  assert.equal(three, 0.2);
  assert.equal(nine, 0.2, "more than three reviews must not exceed the weight");
});

test("mastery is bounded to [0, 1] even with absurd inputs", () => {
  const m = computeMastery({
    problemsPassed: 999,
    problemsTotal: 3,
    hintTier: 0,
    checkpointsPassed: 999,
    checkpointsTotal: 3,
    reviewsSurvived: 999,
  });
  assert.equal(m, 1);
});

test("the threshold is the documented value", () => {
  assert.equal(MASTERY_THRESHOLD, 0.75);
});

/* ── decay ─────────────────────────────────────────────────────────────── */

const NOW = new Date("2026-06-01T12:00:00Z");
const day = 86_400_000;

test("not yet due means no decay", () => {
  const due = new Date(NOW.getTime() + 5 * day).toISOString();
  assert.equal(decayMastery(0.8, due, NOW), 0.8);
});

test("exactly on time means no decay", () => {
  assert.equal(decayMastery(0.8, NOW.toISOString(), NOW), 0.8);
});

test("one interval late costs 15 percent", () => {
  const due = new Date(NOW.getTime() - 1.2 * day).toISOString();
  assert.equal(decayMastery(0.8, due, NOW), 0.68);
});

test("two or more intervals late costs 35 percent", () => {
  const due = new Date(NOW.getTime() - 3 * day).toISOString();
  assert.equal(decayMastery(0.8, due, NOW), 0.52);
});

test("a null due date leaves mastery untouched", () => {
  assert.equal(decayMastery(0.8, null, NOW), 0.8);
});

/* ── SM-2 ──────────────────────────────────────────────────────────────── */

const fresh = { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };

test("first successful review schedules one day out", () => {
  const r = sm2(5, fresh, NOW);
  assert.equal(r.intervalDays, 1);
  assert.equal(r.reps, 1);
  assert.equal(r.lapses, 0);
  assert.equal(r.ease, 2.6);
});

test("second successful review schedules six days out", () => {
  const r = sm2(5, { intervalDays: 1, ease: 2.6, reps: 1, lapses: 0 }, NOW);
  assert.equal(r.intervalDays, 6);
  assert.equal(r.reps, 2);
});

test("third review multiplies by ease", () => {
  const r = sm2(5, { intervalDays: 6, ease: 2.7, reps: 2, lapses: 0 }, NOW);
  // The ease update happens BEFORE the interval is computed, so this uses the
  // NEW ease of 2.8, not the previous 2.7: round(6 * 2.8) = 17.
  assert.equal(r.ease, 2.8);
  assert.equal(r.intervalDays, 17);
  assert.equal(r.reps, 3);
});

test("a lapse resets the interval and increments lapses", () => {
  const r = sm2(2, { intervalDays: 45, ease: 2.8, reps: 4, lapses: 0 }, NOW);
  assert.equal(r.intervalDays, 1);
  assert.equal(r.reps, 0);
  assert.equal(r.lapses, 1);
  assert.ok(r.ease < 2.8, "a lapse must reduce ease");
});

test("ease never falls below 1.3", () => {
  let state = { intervalDays: 10, ease: 1.35, reps: 3, lapses: 0 };
  for (let i = 0; i < 10; i++) {
    const r = sm2(0, state, NOW);
    state = { intervalDays: r.intervalDays, ease: r.ease, reps: r.reps, lapses: r.lapses };
  }
  assert.ok(state.ease >= 1.3, `ease fell to ${state.ease}`);
});

test("the interval is capped at a year", () => {
  let state = { intervalDays: 300, ease: 2.5, reps: 5, lapses: 0 };
  for (let i = 0; i < 4; i++) {
    const r = sm2(5, state, NOW);
    state = { intervalDays: r.intervalDays, ease: r.ease, reps: r.reps, lapses: r.lapses };
  }
  assert.equal(state.intervalDays, 365);
});

test("the due date is the interval in the future", () => {
  const r = sm2(5, { intervalDays: 1, ease: 2.6, reps: 1, lapses: 0 }, NOW);
  const got = new Date(r.dueAt).getTime();
  assert.equal(got, NOW.getTime() + r.intervalDays * day);
});
