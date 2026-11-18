import { test } from "node:test";
import assert from "node:assert/strict";
import { runPython, preflight } from "../src/lib/exec/sandbox.ts";

test("runs simple code and captures stdout", async () => {
  const r = await runPython({ code: "print('hello sandbox')" });
  assert.equal(r.status, "ok");
  assert.match(r.stdout, /hello sandbox/);
  assert.ok(r.runtimeMs >= 0);
});

test("numpy is available in the sandbox venv", async () => {
  const r = await runPython({ code: "import numpy as np\nprint(np.arange(6).reshape(2,3).sum())" });
  assert.equal(r.status, "ok", r.stderr);
  assert.match(r.stdout, /15/);
});

test("timeout is enforced", async () => {
  const r = await runPython({ code: "while True:\n    pass", timeoutMs: 1200 });
  assert.equal(r.status, "timeout");
  assert.equal(r.timedOut, true);
});

test("stderr from an exception is captured", async () => {
  const r = await runPython({ code: "raise ValueError('boom')" });
  assert.equal(r.status, "error");
  assert.match(r.stderr, /ValueError: boom/);
});

test("test cases are validated individually", async () => {
  const r = await runPython({
    code: "def solve(a, b):\n    return a + b",
    testCases: [
      { input: "[1, 2]", expected: "3" },
      { input: "[2, 2]", expected: "5" },
    ],
  });
  assert.equal(r.status, "ok", r.stderr);
  assert.equal(r.totalCount, 2);
  assert.equal(r.passedCount, 1);
  assert.equal(r.testResults?.[0].passed, true);
  assert.equal(r.testResults?.[1].passed, false);
  assert.equal(r.testResults?.[1].actual, "4");
});

test("preflight rejects subprocess", () => {
  const p = preflight("import subprocess\nsubprocess.run(['ls'])");
  assert.equal(p.ok, false);
});

test("preflight rejects file deletion", () => {
  const p = preflight("import os\nos.remove('/etc/passwd')");
  assert.equal(p.ok, false);
});

test("preflight allows numpy", () => {
  const p = preflight("import numpy as np\nprint(np.zeros(3))");
  assert.equal(p.ok, true);
});
