"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";

/**
 * The problem runner.
 *
 * Runs learner code against the problem's test cases in the local sandbox and
 * shows a per-case verdict, plus the deterministic complexity verdict from the
 * AST profiler. The complexity number is computed, never generated.
 */
export function ProblemRunner({
  problemId,
  starter,
  testCases,
  language = "python",
  entry = "solve",
  complexity,
  topicId,
  problemsTotal = 1,
}: {
  problemId: string;
  starter: string;
  testCases: { input: string; expected?: string; mode?: string; tolerance?: number }[];
  language?: string;
  /** The function the harness calls. Omitting it risks testing a helper. */
  entry?: string;
  complexity?: string;
  /** Needed to record progress: progress is tracked per topic, not per problem. */
  topicId?: string;
  problemsTotal?: number;
}) {
  const [code, setCode] = useState(starter);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/exec/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          language,
          entry,
          problemId,
          testCases,
          timeoutMs: 10_000,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Execution failed.");
        return;
      }
      setResult(data as RunPayload);

      // Record the pass. Deliberately not awaited into the UI path: progress
      // bookkeeping must never make a successful run look failed.
      if (
        topicId &&
        (data as RunPayload).totalCount &&
        (data as RunPayload).passedCount === (data as RunPayload).totalCount
      ) {
        void fetch("/api/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "touch",
            topicId,
            problemsPassed: 1,
            problemsTotal,
            hintTier: 0,
            checkpointsPassed: 0,
            checkpointsTotal: 0,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-brand px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "running…" : "run tests"}
        </button>
        <button
          onClick={() => setCode(starter)}
          className="rounded-lg border border-line-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition hover:bg-surface-2"
        >
          reset
        </button>
        {complexity && (
          <span className="ml-auto font-mono text-[11px] text-ink-dimmer">
            reference: {complexity}
          </span>
        )}
      </div>

      <CodeEditor value={code} onChange={setCode} language={language} height="340px" />

      {error && (
        <p className="rounded-lg border border-brand-pink/30 bg-brand-pink/[0.07] px-3 py-2 font-mono text-[11.5px] text-brand-pink">
          {error}
        </p>
      )}

      {result && <RunReport result={result} />}
    </div>
  );
}

interface RunPayload {
  status: string;
  stdout: string;
  stderr: string;
  runtimeMs: number;
  memoryKb: number;
  timedOut: boolean;
  rejectionReason?: string;
  passedCount: number | null;
  totalCount: number | null;
  testResults:
    | { index: number; passed: boolean; input: string; expected?: string; actual?: string; error?: string; runtimeMs: number }[]
    | null;
  analysis: {
    timeComplexity: string;
    spaceComplexity: string;
    loops: { kind: string; depth: number; line: number; label: string }[];
    functionCount: number;
    recursion: { detected: boolean; argumentShrinks: boolean };
    findings: { severity: string; code: string; message: string; line?: number }[];
    unknowns: string[];
    derivation: string[];
  };
}

function RunReport({ result }: { result: RunPayload }) {
  const a = result.analysis;
  return (
    <div className="flex flex-col gap-3">
      {/* ── Verdict ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="verdict"
          value={
            result.rejectionReason
              ? "rejected"
              : result.timedOut
                ? "timeout"
                : result.status === "ok"
                  ? "ran"
                  : "error"
          }
          tone={
            result.rejectionReason || result.timedOut || result.status !== "ok" ? "bad" : "good"
          }
        />
        <Metric
          label="tests"
          value={
            result.totalCount ? `${result.passedCount ?? 0}/${result.totalCount}` : "—"
          }
          tone={
            result.totalCount && result.passedCount === result.totalCount ? "good" : "warn"
          }
        />
        <Metric label="time" value={`${result.runtimeMs} ms`} tone="neutral" />
        <Metric
          label="complexity"
          value={a?.timeComplexity ?? "—"}
          tone="neutral"
        />
      </div>

      {/* ── Deterministic analysis ───────────────────────────────────── */}
      {a && (
        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-brand">
              Deterministic analysis
            </span>
            <span className="rounded border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">
              AST · not a model guess
            </span>
          </div>
          <p className="mb-2 text-[13px] text-ink-dim">
            time <span className="font-mono font-bold text-fg">{a.timeComplexity}</span> · space{" "}
            <span className="font-mono font-bold text-fg">{a.spaceComplexity}</span> ·{" "}
            {a.functionCount} function{a.functionCount === 1 ? "" : "s"} ·{" "}
            {a.loops.length} loop{a.loops.length === 1 ? "" : "s"}
          </p>
          {a.derivation.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1">
              {a.derivation.map((d, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] text-ink-dim">
                  <span className="text-brand">▸</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}
          {a.findings.map((f, i) => (
            <p
              key={i}
              className={`mb-1.5 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${
                f.severity === "critical"
                  ? "border-brand-pink/30 bg-brand-pink/[0.07] text-brand-pink"
                  : f.severity === "warning"
                    ? "border-brand-orange/30 bg-brand-orange/[0.07] text-brand-orange"
                    : "border-line bg-surface-2 text-ink-dim"
              }`}
            >
              {f.line ? <span className="mr-1.5 font-mono text-[11px] opacity-70">L{f.line}</span> : null}
              {f.message}
            </p>
          ))}
          {a.unknowns.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                what the analyser could not determine
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {a.unknowns.map((u, i) => (
                  <li key={i} className="text-[12px] leading-relaxed text-ink-dimmer">
                    {u}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ── Per-case results ─────────────────────────────────────────── */}
      {result.testResults && result.testResults.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          {result.testResults.map((t) => (
            <div
              key={t.index}
              className={`flex items-start gap-3 px-4 py-2.5 ${
                t.index > 0 ? "border-t border-line" : ""
              } bg-surface-1`}
            >
              <span
                className={`mt-0.5 shrink-0 font-mono text-[11px] font-bold ${
                  t.passed ? "text-brand" : "text-brand-pink"
                }`}
              >
                {t.passed ? "✓" : "✗"}
              </span>
              <span className="min-w-0 flex-1 font-mono text-[12px] leading-relaxed">
                <span className="text-ink-dim">in </span>
                <span className="text-fg">{t.input}</span>
                {t.expected !== undefined && (
                  <>
                    <span className="text-ink-dim"> → expected </span>
                    <span className="text-brand">{t.expected}</span>
                  </>
                )}
                {!t.passed && (
                  <>
                    {t.actual !== undefined && (
                      <>
                        <span className="text-ink-dim">, got </span>
                        <span className="text-brand-orange">{t.actual}</span>
                      </>
                    )}
                    {t.error && <span className="text-brand-pink"> · {t.error}</span>}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Streams ──────────────────────────────────────────────────── */}
      {(result.stdout || result.stderr) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {result.stdout && (
            <div className="rounded-xl border border-line bg-surface-1 p-3">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                stdout
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg">
                {result.stdout}
              </pre>
            </div>
          )}
          {result.stderr && (
            <div className="rounded-xl border border-brand-pink/25 bg-surface-1 p-3">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brand-pink">
                stderr
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-brand-pink">
                {result.stderr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-brand"
      : tone === "bad"
        ? "text-brand-pink"
        : tone === "warn"
          ? "text-brand-orange"
          : "text-fg";
  return (
    <div className="rounded-lg border border-line bg-surface-1 px-3 py-2">
      <div className={`font-mono text-[15px] font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
        {label}
      </div>
    </div>
  );
}
