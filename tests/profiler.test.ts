import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePython } from "../src/lib/analysis/complexity.ts";

test("constant time", () => {
  const a = analyzePython("def f(x):\n    return x + 1");
  assert.equal(a.timeComplexity, "O(1)");
  assert.equal(a.spaceComplexity, "O(1)");
});

test("linear time", () => {
  const a = analyzePython("def f(xs):\n    t = 0\n    for x in xs:\n        t += x\n    return t");
  assert.equal(a.timeComplexity, "O(n)");
});

test("quadratic time from nested loops", () => {
  const a = analyzePython(
    "def f(xs):\n    for i in range(len(xs)):\n        for j in range(len(xs)):\n            print(xs[i], xs[j])",
  );
  assert.equal(a.timeComplexity, "O(n²)");
  assert.ok(a.findings.some((x) => x.severity === "warning"));
});

test("cubic time from triple nesting", () => {
  const a = analyzePython("def f(xs):\n    for i in xs:\n        for j in xs:\n            for k in xs:\n                print(i,j,k)");
  assert.equal(a.timeComplexity, "O(n³)");
  assert.ok(a.findings.some((x) => x.severity === "critical"));
});

test("recursion with shrinking argument", () => {
  const a = analyzePython("def fact(n):\n    if n<=1: return 1\n    return n*fact(n-1)");
  assert.equal(a.recursion.detected, true);
  assert.equal(a.recursion.argumentShrinks, true);
});

test("recursion without shrinking argument is flagged", () => {
  const a = analyzePython("def f(n):\n    return f(n)+1");
  assert.equal(a.recursion.detected, true);
  assert.equal(a.recursion.argumentShrinks, false);
});

test("strings and comments do not create false loops", () => {
  const a = analyzePython('def f(x):\n    # for i in range(10):\n    s = "for i in range(10)"\n    return x');
  assert.equal(a.loops.length, 0);
});

test("comprehension is detected as a loop", () => {
  const a = analyzePython("def f(xs):\n    return [x*2 for x in xs]");
  assert.ok(a.loops.some((l) => l.kind === "comprehension"));
});

test("container allocation implies linear space", () => {
  const a = analyzePython("def f(xs):\n    out = []\n    for x in xs:\n        out.append(x)\n    return out");
  assert.equal(a.spaceComplexity, "O(n)");
});

test("for-loop iteration is not flagged as a membership test", () => {
  const a = analyzePython("def f(xs):\n    for i in range(len(xs)):\n        print(i)");
  assert.equal(a.findings.filter((x) => /membership/i.test(x.message)).length, 0);
});

test("a real membership test against a list is flagged", () => {
  const a = analyzePython("def f(xs):\n    for x in xs:\n        if x in [1,2,3]:\n            print(x)");
  assert.ok(a.findings.some((x) => /membership/i.test(x.message)));
});
