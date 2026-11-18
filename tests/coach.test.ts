import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTierPrompt,
  offlineTierResponse,
  parseTierOutput,
  requestTier,
} from "../src/lib/coach/nexus";
import { HINT_TIERS, MAX_TIER, isDisclosed, nextTier } from "../src/lib/coach/tiers";
import { classifyHttpError, classifyNetworkError } from "../src/lib/coach/providers";
import { analyzePython } from "../src/lib/analysis/complexity";

const ctx = {
  topicTitle: "Linear Algebra",
  topicBody: "PCA is a special case of SVD.",
  learnerText: "I think we should just compute the covariance.",
  code: "def f(xs):\n    for x in xs:\n        print(x)",
};

test("the ladder has exactly five tiers in order", () => {
  assert.equal(HINT_TIERS.length, 5);
  assert.deepEqual(
    HINT_TIERS.map((t) => t.tier),
    [1, 2, 3, 4, 5],
  );
  assert.equal(MAX_TIER, 5);
});

test("nextTier advances one rung and stops at the top", () => {
  assert.equal(nextTier(0), 1);
  assert.equal(nextTier(4), 5);
  assert.equal(nextTier(5), null);
});

test("isDisclosed reflects the revealed tier", () => {
  assert.equal(isDisclosed(2, 1), true);
  assert.equal(isDisclosed(2, 3), false);
});

test("the prompt forbids revealing the next tier", () => {
  for (const tier of [1, 2, 3, 4]) {
    const messages = buildTierPrompt(tier, ctx);
    const user = messages[1].content;
    assert.match(user, /MUST NOT reveal it/i);
    assert.ok(user.includes(HINT_TIERS[tier - 1].label));
  }
});

test("the final tier prompt does not forbid a next tier", () => {
  const messages = buildTierPrompt(5, ctx);
  assert.doesNotMatch(messages[1].content, /MUST NOT reveal it/i);
  assert.match(messages[1].content, /final tier/i);
});

test("the prompt includes the deterministic analysis, not just the code", () => {
  const analysis = analyzePython(ctx.code);
  const messages = buildTierPrompt(2, {
    ...ctx,
    analysisSummary: `Deterministic AST analysis: time ${analysis.timeComplexity}.`,
  });
  assert.match(messages[1].content, /Deterministic AST analysis/);
});

test("tagged model output parses into a structured response", () => {
  const raw = `<content>Start from the spectrum.</content>

<checkpoint>What is A^T A?</checkpoint>

<block kind="math" language="tex">
$$A^\\top A = V\\Sigma^2 V^\\top$$
</block>`;

  const parsed = parseTierOutput(raw, 4);
  assert.equal(parsed.tier, 4);
  assert.equal(parsed.key, "derivation");
  assert.equal(parsed.content, "Start from the spectrum.");
  assert.equal(parsed.checkpoint, "What is A^T A?");
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0].kind, "math");
});

test("the offline coach produces a usable answer at every tier", () => {
  for (const tier of [1, 2, 3, 4, 5]) {
    const r = offlineTierResponse(tier, ctx);
    assert.equal(r.tier, tier);
    assert.ok(r.content.length > 80, `tier ${tier} content too short`);
    assert.ok(r.checkpoint && r.checkpoint.length > 20, `tier ${tier} missing checkpoint`);
  }
});

test("the offline coach at tier 5 warns before giving the answer", () => {
  const r = offlineTierResponse(5, ctx);
  assert.ok(r.blocks.some((b) => b.kind === "warning"));
});

test("requestTier degrades to the offline coach when the provider fails", async () => {
  const failing = {
    id: "openai" as const,
    label: "failing",
    requiresKey: true,
    defaultModel: "x",
    models: ["x"],
    chat: async () => ({
      text: "",
      model: "x",
      provider: "openai" as const,
      error: { kind: "network" as const, message: "Could not reach the provider." },
    }),
  };

  const result = await requestTier(2, ctx, failing);
  assert.equal(result.degraded, true);
  assert.match(result.reason ?? "", /Could not reach/);
  assert.ok(result.response.content.length > 80);
});

test("http errors are classified into distinct, actionable kinds", () => {
  assert.equal(classifyHttpError(401, "invalid api key").kind, "invalid_key");
  assert.equal(classifyHttpError(429, "").kind, "rate_limited");
  assert.equal(classifyHttpError(404, "").kind, "not_found");
  assert.equal(classifyHttpError(503, "").kind, "server_error");
});

test("network errors are distinguished from credential errors", () => {
  const e = classifyNetworkError(new Error("connection refused"));
  assert.equal(e.kind, "network");
  assert.match(e.message, /internet connection/i);
});
