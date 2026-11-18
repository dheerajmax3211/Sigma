import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/lib/decks/expr";
import { deckIds, loadDeck } from "../src/lib/decks/load";
import { checkDeck } from "../src/lib/decks/validate";
import { Deck } from "../src/lib/decks/schema";

test("expr: precedence, unary minus, power, functions", () => {
  assert.equal(evaluate("2 + 3 * 4", {}), 14);
  assert.equal(evaluate("-2 ^ 2", {}), -4);
  assert.equal(evaluate("(w - 3) ^ 2", { w: 1 }), 4);
  assert.equal(evaluate("max(1, sqrt(16))", {}), 4);
  assert.throws(() => evaluate("q + 1", {}));
  assert.throws(() => evaluate("process.exit()", {}));
});

test("every shipped deck passes the validator", () => {
  for (const id of deckIds()) assert.deepEqual(checkDeck(loadDeck(id)!), [], id);
});

test("backprop numbers match hand calculation", () => {
  // x=2 w1=.5 w2=.5 y=3: h=1, yh=.5, dyh=-5, dw2=-5, dh=-2.5, dw1=-5
  const s = { x: 2, w1: 0.5, w2: 0.5, y: 3 } as Record<string, number>;
  for (const [k, e] of [["h", "w1*x"], ["yh", "w2*h"], ["dyh", "2*(yh-y)"], ["dw2", "dyh*h"], ["dh", "dyh*w2"], ["dw1", "dh*x"]]) s[k] = evaluate(e, s);
  assert.deepEqual([s.h, s.yh, s.dyh, s.dw2, s.dh, s.dw1], [1, 0.5, -5, -5, -2.5, -5]);
});

test("validator rejects broken decks", () => {
  const good = loadDeck("backpropagation")!;
  const bad = (f: (d: Deck) => void) => { const d = structuredClone(good); f(d); return checkDeck(d); };
  assert.ok(bad((d) => { d.derived[0].expr = "nope * 2"; }).some((e) => /unknown name/.test(e)));
  assert.ok(bad((d) => { d.cards = d.cards.filter((c) => c.kind !== "check"); }).some((e) => /check question/.test(e)));
  assert.ok(bad((d) => { const c = d.cards[0]; if (c.kind === "story") c.body = [Array(200).fill("word").join(" ")]; }).some((e) => /words/.test(e)));
  assert.ok(bad((d) => { const c = d.cards[2]; if (c.kind === "formula") c.tex = "\\frac{"; }).some((e) => /bad tex/.test(e)));
  assert.ok(bad((d) => { const c = d.cards[5]; if (c.kind === "check") c.options.forEach((o) => (o.correct = true)); }).some((e) => /exactly one/.test(e)));
  assert.ok(bad((d) => { const c = d.cards[2]; if (c.kind === "formula") c.verify[0].equals = 99; }).some((e) => /verify/.test(e)));
  assert.ok(bad((d) => { const c = d.cards[2]; if (c.kind === "formula") c.verify = []; }).some((e) => /needs at least one/.test(e)));
  assert.ok(bad((d) => { const c = d.cards[0]; if (c.kind === "story") c.body = ["This sentence " + Array(40).fill("keeps going").join(" ") + "."]; }).some((e) => /sentence of/.test(e)));
});

test("deckPlacement: outline decks get track and week, unknown ids are absent", async () => {
  const { deckPlacement } = await import("../src/lib/decks/weeks");
  const p = deckPlacement();
  assert.deepEqual(p["numbers-and-functions"], { track: "path", week: 1, group: "Week 1" });
  assert.equal(p["no-such-deck"], undefined);
});

test("every python code card in the dsa track runs (its asserts pass)", async () => {
  const { spawnSync } = await import("node:child_process");
  const { deckPlacement } = await import("../src/lib/decks/weeks");
  const where = deckPlacement();
  for (const id of deckIds().filter((d) => ["dsa", "interview", "deep"].includes(where[d]?.track ?? ""))) {
    for (const c of loadDeck(id)!.cards) {
      if (c.kind !== "code" || c.lang !== "python") continue;
      const r = spawnSync("python3", ["-I", "-c", c.code], { encoding: "utf8", timeout: 10000 });
      assert.equal(r.status, 0, `${id} / ${c.title}: ${r.stderr}`);
    }
  }
});

test("every practice card: the solution passes its tests and the starter does not", async () => {
  const { spawnSync } = await import("node:child_process");
  const harness = (code: string, entry: string, tests: { input: string; expected: string }[]) =>
    `import json\n${code}\nfails = 0\nfor a, e in json.loads(${JSON.stringify(JSON.stringify(tests.map((t) => [t.input, t.expected])))}):\n    try:\n        ok = json.loads(json.dumps(${entry}(*json.loads(a)))) == json.loads(e)\n    except Exception:\n        ok = False\n    fails += not ok\nraise SystemExit(fails)`;
  for (const id of deckIds()) for (const c of loadDeck(id)!.cards) {
    if (c.kind !== "practice") continue;
    const sol = spawnSync("python3", ["-I", "-c", harness(c.solution, c.entry, c.tests)], { encoding: "utf8", timeout: 10000 });
    assert.equal(sol.status, 0, `${id} / ${c.title}: solution fails ${sol.status} test(s) ${sol.stderr}`);
    const st = spawnSync("python3", ["-I", "-c", harness(c.starter, c.entry, c.tests)], { encoding: "utf8", timeout: 10000 });
    assert.notEqual(st.status, 0, `${id} / ${c.title}: starter already passes`);
  }
});

test("expr: pick replays a trace and clamps", () => {
  assert.equal(evaluate("pick(1, 5, 7, 9)", {}), 7);
  assert.equal(evaluate("pick(9, 5, 7, 9)", {}), 9);
  assert.equal(evaluate("pick(-1, 5, 7, 9)", {}), 5);
});
