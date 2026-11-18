"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor, LESSON_SNIPPET_KEY, type SnippetRecord } from "@/components/CodeEditor";

/**
 * A real execution lab.
 *
 * The page previously claimed to be "a standalone page for running code
 * without a topic" while only rendering links to topics. This is the thing
 * that docstring described: an editor, a run button, captured output, and the
 * measured metrics the sandbox actually returns.
 *
 * Every number shown here comes from the sandbox or the AST profiler. Nothing
 * is estimated in the browser.
 */

interface TestResult {
  index: number;
  input: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  error?: string;
  runtimeMs: number;
}

interface Analysis {
  timeComplexity: string;
  spaceComplexity: string;
  derivation: string[];
  findings: { severity: string; message: string; line?: number }[];
  loops?: { kind: string; depth: number; line: number }[];
  unknowns?: string[];
}

interface RunResponse {
  status: "ok" | "error" | "timeout" | "rejected";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  runtimeMs: number;
  cpuMs: number;
  memoryKb: number;
  analysis?: Analysis;
  testResults?: TestResult[];
  passedCount?: number;
  totalCount?: number;
  rejectionReason?: string;
  error?: string;
}

const STARTER = `import numpy as np

def attention_scores(Q, K):
    """Scaled dot-product attention scores.

    Q: (n_q, d)   K: (n_k, d)
    Returns (n_q, n_k) pre-softmax scores.
    """
    d = Q.shape[-1]
    return (Q @ K.T) / np.sqrt(d)

# Try changing the shapes and watch the complexity verdict.
Q = np.random.randn(8, 16)
K = np.random.randn(8, 16)
print(attention_scores(Q, K).shape)
`;

/**
 * Autosave and run history.
 *
 * Both are best-effort: storage can be disabled or full, and neither is worth
 * breaking the editor over. The autosave record is the working copy; history
 * is the code that was actually handed to the sandbox, newest first, capped so
 * the aside stays a glance rather than an archive.
 */
const LAB_AUTOSAVE_KEY = "sigma.lab.autosave";
const LAB_HISTORY_KEY = "sigma.lab.history";
const AUTOSAVE_DEBOUNCE_MS = 400;
const HISTORY_LIMIT = 5;

interface StoredCode {
  code: string;
  at: number;
}

function toStoredCode(value: unknown): StoredCode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { code?: unknown; at?: unknown };
  if (typeof record.code !== "string" || !record.code.trim()) return null;
  const at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : 0;
  return { code: record.code, at };
}

function readAutosave(): StoredCode | null {
  try {
    const raw = window.localStorage.getItem(LAB_AUTOSAVE_KEY);
    return raw ? toStoredCode(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function readHistory(): StoredCode[] {
  try {
    const raw = window.localStorage.getItem(LAB_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: unknown[] = parsed;
    return items
      .map(toStoredCode)
      .filter((item): item is StoredCode => item !== null)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: autosave is a convenience, not a guarantee.
  }
}

/** First meaningful line, for a compact history row. */
function firstLine(code: string): string {
  const line = code
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));
  return line ?? "(blank)";
}

const SNIPPETS: { label: string; note: string; code: string }[] = [
  {
    label: "O(n²) vs O(n)",
    note: "same result, different complexity — the profiler will tell you",
    code: `import numpy as np

def slow(xs, target):
    # membership test on a list: O(n) per lookup
    hits = []
    for x in xs:
        if x in xs:
            hits.append(x)
    return hits

def fast(xs, target):
    s = set(xs)          # O(n) once
    return [x for x in xs if x in s]
`,
  },
  {
    label: "Timeout guard",
    note: "the sandbox kills the process group at the wall-clock limit",
    code: `# This will be terminated by the sandbox timeout.
# The point is that it dies cleanly instead of hanging the server.
while True:
    pass
`,
  },
  {
    label: "Numerical conditioning",
    note: "compare a stable solve against the normal equations",
    code: `import numpy as np

rng = np.random.default_rng(0)
n = 60
U, _ = np.linalg.qr(rng.normal(size=(n, n)))
V, _ = np.linalg.qr(rng.normal(size=(n, n)))
S = np.logspace(0, -6, n)
A = U @ np.diag(S) @ V.T

x = rng.normal(size=n)
b = A @ x

print("kappa(A)      =", np.linalg.cond(A))
print("stable solve  =", np.linalg.norm(np.linalg.solve(A, b) - x) / np.linalg.norm(x))
print("normal eqs    =", np.linalg.norm(np.linalg.solve(A.T @ A, A.T @ b) - x) / np.linalg.norm(x))
`,
  },
  {
    label: "Memory: allocation vs in-place",
    note: "peak RSS is reported, so you can see the difference",
    code: `import numpy as np

n = 2000
A = np.random.randn(n, n)
B = np.random.randn(n, n)

# Allocates a third n x n array.
C = A @ B
print("allocated:", C.shape, C.nbytes // 1024 // 1024, "MB")
`,
  },
];

export function LabRunner() {
  const [code, setCode] = useState(STARTER);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [fromLesson, setFromLesson] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [history, setHistory] = useState<StoredCode[]>([]);
  const runButton = useRef<HTMLButtonElement>(null);
  const wasPrefilled = useRef(false);
  // Guards: neither effect may write before the mount effect has had its say,
  // or the default starter would overwrite the session it is meant to restore.
  const autosaveReady = useRef(false);
  const autosaveArmed = useRef(false);
  // Authoritative history list: state mirrors it for rendering, but writes
  // read the ref so a run recorded during hydration cannot persist the
  // pre-hydration empty array over the stored one.
  const historyRef = useRef<StoredCode[]>([]);
  // StrictMode re-runs mount effects in development. The snippet handoff is
  // consumed on the first run, so a second run must not fall through to the
  // autosave and overwrite the snippet it just loaded.
  const didInit = useRef(false);
  // The last code written to the autosave key. Seeded by the mount effect so
  // an untouched editor does not count as a change worth persisting.
  const lastSavedCode = useRef<string | null>(null);

  // A "Run" control in a lesson leaves its snippet in localStorage and comes
  // here. Read it once, clear it so a refresh does not resurrect stale code,
  // and load it without executing: a surprise run is worse than one click.
  //
  // Precedence: a lesson handoff wins over the autosave. The handoff is an
  // explicit action that just happened; the autosave is merely what was left
  // on screen last time, so silently preferring it would ignore the click.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const savedHistory = readHistory();
    historyRef.current = savedHistory;
    if (savedHistory.length > 0) setHistory(savedHistory);

    let snippet: string | null = null;
    try {
      const raw = window.localStorage.getItem(LESSON_SNIPPET_KEY);
      if (raw) {
        window.localStorage.removeItem(LESSON_SNIPPET_KEY);
        const parsed: unknown = JSON.parse(raw);
        const record = parsed as Partial<SnippetRecord> | null;
        if (record && typeof record.code === "string" && record.code.trim()) {
          snippet = record.code;
        }
      }
    } catch {
      // Malformed payload or storage disabled: fall back to the starter.
      snippet = null;
    }

    const saved = snippet ? null : readAutosave();
    const initial = snippet ?? saved?.code ?? STARTER;
    lastSavedCode.current = initial;

    if (snippet) {
      // The handoff is now the working copy, so make it survive a reload too.
      writeLocal(LAB_AUTOSAVE_KEY, { code: snippet, at: Date.now() } satisfies StoredCode);
    } else if (saved) {
      setRestoredAt(saved.at);
    }
    if (initial !== code) setCode(initial);

    autosaveReady.current = true;

    if (!snippet) return;
    wasPrefilled.current = true;
    setFromLesson(true);
    // A timer rather than rAF: rAF is throttled in background tabs, and this
    // also lands after Monaco's own focus-on-mount.
    window.setTimeout(() => runButton.current?.focus(), 0);
    // `code` is only the pre-hydration starter here; the effect is mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced working copy. 400ms is long enough that typing does not hit
  // storage on every keystroke, short enough that a closed tab loses at most
  // the last few characters. An unchanged editor writes nothing.
  useEffect(() => {
    if (!autosaveReady.current) return;
    if (!autosaveArmed.current) {
      // The first pass still sees the pre-hydration starter. Arm only once
      // the editor holds the value the mount effect decided on.
      if (code !== lastSavedCode.current) return;
      autosaveArmed.current = true;
      return;
    }
    if (code === lastSavedCode.current) return;
    const id = window.setTimeout(() => {
      lastSavedCode.current = code;
      writeLocal(LAB_AUTOSAVE_KEY, { code, at: Date.now() } satisfies StoredCode);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [code]);

  // Persist explicitly on the one event that changes history. An effect would
  // also fire on hydrating the list from storage, and in StrictMode could
  // write the pre-hydration empty array back over it.
  const recordRun = useCallback((snapshot: string) => {
    const entry: StoredCode = { code: snapshot, at: Date.now() };
    const prev = historyRef.current;
    const next =
      prev[0]?.code === snapshot
        ? [entry, ...prev.slice(1)]
        : [entry, ...prev.filter((item) => item.code !== snapshot)].slice(0, HISTORY_LIMIT);
    historyRef.current = next;
    setHistory(next);
    writeLocal(LAB_HISTORY_KEY, next);
  }, []);

  function loadCode(next: string) {
    setCode(next);
    setResult(null);
    setFromLesson(false);
    setRestoredAt(null);
  }

  /** Drop the autosaved copy and go back to the starter. */
  function resetAutosave() {
    setCode(STARTER);
    setResult(null);
    setFromLesson(false);
    setRestoredAt(null);
    // The starter is not a session worth restoring: forget it as the last
    // saved value so the writer does not immediately put it back.
    lastSavedCode.current = STARTER;
    try {
      window.localStorage.removeItem(LAB_AUTOSAVE_KEY);
    } catch {
      // Storage disabled — the in-memory reset still happened.
    }
  }

  async function run() {
    // Snapshot before awaiting: the editor may change while the sandbox works,
    // and history must record what was actually sent.
    recordRun(code);
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/exec/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, language: "python" }),
      });
      const json = (await res.json()) as RunResponse;
      setResult(json);
    } catch (err) {
      setResult({
        status: "error",
        stdout: "",
        stderr: (err as Error).message,
        exitCode: null,
        runtimeMs: 0,
        cpuMs: 0,
        memoryKb: 0,
      });
    } finally {
      setRunning(false);
    }
  }

  const a = result?.analysis;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-1">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-orange">
              sandbox.py
            </span>
            <span className="ml-auto font-mono text-[10px] text-ink-dimmer">
              python 3.12 · numpy
            </span>
            <button
              ref={runButton}
              onClick={run}
              disabled={running}
              aria-label="Run the code in the sandbox"
              className="ml-3 rounded-lg bg-brand-orange px-5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110 disabled:opacity-50"
            >
              {running ? "running…" : "run"}
            </button>
          </div>
          {fromLesson && (
            <p className="flex flex-wrap items-center gap-1.5 border-b border-line bg-brand/10 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-brand">
              loaded from a lesson example
              <span className="font-sans text-[11px] normal-case tracking-normal text-ink-dim">
                — nothing has run yet; press run when you are ready
              </span>
            </p>
          )}
          {restoredAt !== null && (
            <p className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface-2 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
              restored your last session
              <span className="font-sans text-[11px] normal-case tracking-normal text-ink-dimmer">
                {restoredAt > 0 ? `· ${new Date(restoredAt).toLocaleString()}` : ""}
              </span>
              <button
                type="button"
                onClick={resetAutosave}
                className="ml-auto shrink-0 font-sans text-[11px] normal-case tracking-normal text-brand underline underline-offset-2 hover:brightness-110"
              >
                reset
              </button>
            </p>
          )}
          <CodeEditor
            value={code}
            onChange={setCode}
            height="420px"
            language="python"
            onMount={() => {
              // Monaco focuses itself when it mounts; only claim focus back
              // when the learner arrived from a lesson and expects "run".
              if (!wasPrefilled.current) return;
              window.setTimeout(() => runButton.current?.focus(), 0);
            }}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface-1">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
              output
            </span>
            {result && (
              <span
                className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] ${
                  result.status === "ok"
                    ? "bg-brand/15 text-brand"
                    : "bg-brand-pink/15 text-brand-pink"
                }`}
              >
                {result.status}
              </span>
            )}
          </div>
          <div className="max-h-[280px] overflow-auto px-4 py-3">
            {!result && (
              <p className="py-6 text-center font-mono text-[12px] text-ink-dimmer">
                Run the code to see output and measured metrics.
              </p>
            )}
            {result?.status === "rejected" && (
              <p className="font-mono text-[12px] text-brand-orange">
                Preflight rejected: {result.rejectionReason}
              </p>
            )}
            {result?.stdout && (
              <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg">
                {result.stdout}
              </pre>
            )}
            {result?.stderr && (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-brand-pink">
                {result.stderr}
              </pre>
            )}
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        {result && (
          <div className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
              measured
            </div>
            <dl className="flex flex-col gap-1.5 font-mono text-[11.5px]">
              {[
                ["wall", `${result.runtimeMs} ms`],
                ["cpu", `${result.cpuMs} ms`],
                ["peak rss", `${Math.round(result.memoryKb / 1024)} MB`],
                ["exit", String(result.exitCode ?? "—")],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-ink-dimmer">{k}</dt>
                  <dd className="text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {a && (
          <div className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
              complexity · deterministic
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded bg-brand/15 px-2 py-0.5 font-mono text-[11px] text-brand">
                time {a.timeComplexity}
              </span>
              <span className="rounded bg-brand-violet/15 px-2 py-0.5 font-mono text-[11px] text-brand-violet">
                space {a.spaceComplexity}
              </span>
            </div>
            {a.derivation.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1">
                {a.derivation.map((d, i) => (
                  <li key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed text-ink-dim">
                    <span className="text-ink-dimmer">·</span>
                    {d}
                  </li>
                ))}
              </ul>
            )}
            {a.findings.length > 0 && (
              <div className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2.5">
                {a.findings.slice(0, 4).map((f, i) => (
                  <p key={i} className="text-[11.5px] leading-relaxed text-brand-orange">
                    {f.line ? `L${f.line} ` : ""}
                    {f.message}
                  </p>
                ))}
              </div>
            )}
            {a.unknowns && a.unknowns.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                  not determined
                </span>
                {a.unknowns.slice(0, 3).map((u, i) => (
                  <p key={i} className="text-[11px] leading-relaxed text-ink-dimmer">
                    {u}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-line bg-surface-1 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
            snippets
          </div>
          <div className="flex flex-col gap-1.5">
            {SNIPPETS.map((s) => (
              <button
                key={s.label}
                onClick={() => loadCode(s.code)}
                className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-left transition hover:border-line-2"
              >
                <span className="block text-[12px] font-medium text-fg">{s.label}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-dimmer">
                  {s.note}
                </span>
              </button>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="mb-2 flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
              recent runs
              <span className="ml-auto text-[9.5px] normal-case tracking-normal">
                {history.length}/{HISTORY_LIMIT}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {history.map((entry, i) => (
                <button
                  key={`${entry.at}-${i}`}
                  type="button"
                  onClick={() => loadCode(entry.code)}
                  title="Load this code back into the editor — nothing runs"
                  className="group flex items-baseline gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-line hover:bg-surface-2"
                >
                  <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.06em] text-brand-orange">
                    {entry.at > 0
                      ? new Date(entry.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                  <span className="min-w-0 truncate font-mono text-[11px] text-ink-dim group-hover:text-fg">
                    {firstLine(entry.code)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="px-1 text-[11.5px] leading-relaxed text-ink-dimmer">
          Runs in an isolated child process with its own process group, a
          wall-clock timeout, and an output cap. The preflight refuses
          subprocess, filesystem deletion, and raw sockets — it is a guard
          rail, not a security boundary.
        </p>
      </aside>
    </div>
  );
}
