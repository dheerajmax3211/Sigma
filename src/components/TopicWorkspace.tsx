"use client";

import { useState } from "react";
import { Markdown, InlineMath, CodeEditor } from "@/components/CodeEditor";
import { LessonBody } from "@/components/LessonBody";
import { HintLadder } from "@/components/HintLadder";
import { ProblemRunner } from "@/components/ProblemRunner";
import { DerivationView } from "@/components/DerivationView";
import { CheckpointList } from "@/components/CheckpointList";
import { VisualizerHost } from "@/components/VisualizerHost";

/**
 * The study workspace.
 *
 * Three panes: the lesson on the left, the coach in the middle, and the
 * practice lab on the right. The reference app used a two-pane coding screen; the third
 * pane exists because in an ML curriculum the derivation and the coach are
 * not the same artefact, and separating them stops the lesson from scrolling
 * the conversation out of view.
 */

type Tab = "lesson" | "derivation" | "code" | "practice" | "checkpoints";

/**
 * A template that actually runs.
 *
 * It exists because an empty editor is a trap: the sandbox correctly rejects
 * empty source, but a learner who has not typed anything yet reads that
 * rejection as "the run button is broken". This gives them a program that
 * prints something on the first click, and a shape to edit.
 */
const DEFAULT_CODE = `import numpy as np

# Starter — this runs as-is. Replace it with your own implementation.
# NumPy is available; print shapes and values as you go.
x = np.arange(12, dtype=float).reshape(3, 4)

print("x =")
print(x)
print("shape:", x.shape, "dtype:", x.dtype)
print("column means:", x.mean(axis=0))
`;

export function TopicWorkspace({
  topicId,
  title,
  summary,
  difficulty,
  estMinutes,
  bodyHtml,
  bigIdea,
  problem,
  analogy,
  conceptPoints,
  definitions,
  diagrams,
  tryIt,
  interviewQuestions,
  commonMistakes,
  furtherReading,
  design,
  initialStep,
  derivations,
  implementations,
  checkpoints,
  problems,
  visualizers,
  nextTopic,
  trackHref,
}: {
  topicId: string;
  title: string;
  summary: string;
  difficulty: string;
  estMinutes: number;
  bodyHtml: string;
  bigIdea?: string;
  problem: string[];
  analogy?: string;
  conceptPoints: string[];
  definitions: { term: string; meaning: string }[];
  diagrams: import("@/lib/content/schema").Diagram[];
  tryIt?: string;
  interviewQuestions: import("@/lib/content/schema").InterviewQuestion[];
  commonMistakes: string[];
  furtherReading: import("@/lib/content/schema").FurtherReading[];
  design?: import("@/components/LessonBody").DesignBlock;
  initialStep?: number;
  derivations: { title: string; latex?: string; prose?: string }[];
  implementations: { language: string; title?: string; code: string; note?: string }[];
  checkpoints: { id: string; question: string; solution?: string; hint?: string }[];
  problems: {
    id: string;
    title: string;
    difficulty: string;
    prompt: string;
    starter?: string;
    language: string;
    entry: string;
    testCases: { input: string; expected?: string; mode?: string; tolerance?: number }[];
    complexity?: string;
  }[];
  visualizers: { id: string; kind: string; title: string; description?: string; params: Record<string, unknown> }[];
  /** The next topic in this track, in `position` order. Optional: the page owns course order. */
  nextTopic?: { id: string; title: string };
  /** Where the lesson CTA goes when this is the last topic in its track. */
  trackHref?: string;
}) {
  const [tab, setTab] = useState<Tab>("lesson");
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Empty code is not a neutral default: the sandbox rejects it, and a learner
  // who clicks "run" on an untouched editor deserves a working program rather
  // than a silent no-op. Prefer the topic's own implementation, then a
  // problem's starter, then a small runnable NumPy template.
  const starterCode =
    implementations[0]?.code ??
    problems.find((p) => p.starter)?.starter ??
    DEFAULT_CODE;
  const [code, setCode] = useState(starterCode);
  // Which slide-over is open. The lesson owns the screen; the coach and the
  // runner come to it on demand instead of competing for width.
  const [drawer, setDrawer] = useState<null | "coach" | "code">(null);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "lesson", label: "Lesson" },
    { key: "derivation", label: "Derivation", badge: derivations.length },
    { key: "code", label: "From scratch", badge: implementations.length },
    { key: "practice", label: "Practice", badge: problems.length },
    { key: "checkpoints", label: "Self-check", badge: checkpoints.length },
  ];

  return (
    <div className="mx-auto max-w-[1800px] px-5 py-7">
      {/* ── Title bar ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <span className="rounded-md border border-brand/25 bg-brand/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-brand">
            {difficulty}
          </span>
          <span className="font-mono text-[11px] text-ink-dimmer">{estMinutes} min read</span>
        </div>
        <h1 className="text-[1.85rem] font-semibold leading-tight tracking-[-0.02em] text-fg">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-ink-dim">
          <InlineMath source={summary} />
        </p>
      </div>

      <div className="grid gap-4">
        {/* ── LEFT: lesson ──────────────────────────────────────────── */}
        <section className="mx-auto w-full min-w-0 max-w-[900px]">
          <div className="mb-3 flex flex-wrap gap-1 border-b border-line pb-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 font-mono text-[11.5px] font-semibold uppercase tracking-[0.07em] transition ${
                  tab === t.key
                    ? "bg-surface-3 text-fg"
                    : "text-ink-dimmer hover:bg-surface-2 hover:text-ink-dim"
                }`}
              >
                {t.label}
                {t.badge ? <span className="ml-1.5 opacity-60">{t.badge}</span> : null}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-line bg-surface-1 p-6">
            {tab === "lesson" && (
              <>
                <LessonBody
                  bodyHtml={bodyHtml}
                  bigIdea={bigIdea}
                  problem={problem}
                  analogy={analogy}
                  conceptPoints={conceptPoints}
                  diagrams={diagrams}
                  definitions={definitions}
                  tryIt={tryIt}
                  interviewQuestions={interviewQuestions}
                  commonMistakes={commonMistakes}
                  furtherReading={furtherReading}
                  design={design}
                  initialStep={initialStep}
                  nextTopic={nextTopic}
                  trackHref={trackHref}
                />
                {visualizers.length > 0 && (
                  <div className="mt-8 flex flex-col gap-4">
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
                      Interactive visualizers
                    </h3>
                    {visualizers.map((v) => (
                      <VisualizerHost key={v.id} visualizer={v} />
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "derivation" && <DerivationView derivations={derivations} />}

            {tab === "code" && (
              <div className="flex flex-col gap-6">
                {implementations.map((impl, i) => (
                  <div key={i}>
                    {impl.title && (
                      <h2 className="mb-2 text-[15px] font-semibold text-fg">{impl.title}</h2>
                    )}
                    {impl.note && (
                      <p className="mb-3 text-[13.5px] leading-relaxed text-ink-dim">{impl.note}</p>
                    )}
                    <pre className="overflow-x-auto rounded-xl border border-line bg-surface-2 px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-fg">
                      <code>{impl.code}</code>
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {tab === "practice" && (
              <div className="flex flex-col gap-8">
                {problems.map((p) => (
                  <div key={p.id} className="flex flex-col gap-3">
                    <div>
                      <div className="mb-1.5 flex items-center gap-2.5">
                        <h2 className="text-[15px] font-semibold text-fg">{p.title}</h2>
                        <span className="rounded border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                          {p.difficulty}
                        </span>
                      </div>
                      <p className="text-[13.5px] leading-relaxed text-ink-dim">
                        <InlineMath source={p.prompt} />
                      </p>
                    </div>
                    <ProblemRunner
                      problemId={p.id}
                      starter={p.starter ?? ""}
                      testCases={p.testCases}
                      language={p.language}
                      entry={p.entry}
                      complexity={p.complexity}
                      topicId={topicId}
                      problemsTotal={problems.length}
                    />
                  </div>
                ))}
              </div>
            )}

            {tab === "checkpoints" && <CheckpointList checkpoints={checkpoints} />}
          </div>
        </section>

        {/* ── Slide-over drawers ───────────────────────────────────────
             The old layout split one screen three ways, which squeezed the
             reading column and reduced Monaco to a 260px slot. The lesson now
             owns the page; the coach and the runner arrive on demand. ─── */}
        {drawer && (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px]"
            onClick={() => setDrawer(null)}
            aria-hidden
          />
        )}

        <aside
          className={`fixed right-0 top-0 z-40 flex h-full w-[min(440px,94vw)] flex-col border-l border-line bg-surface-1 shadow-2xl transition-transform duration-300 ${
            drawer === "coach" ? "translate-x-0" : "translate-x-full"
          }`}
          aria-hidden={drawer !== "coach"}
        >
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/15 font-mono text-[12px] font-bold text-brand ring-1 ring-brand/30">
              N
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-fg">Ask Nexus</h2>
              <p className="font-mono text-[10.5px] text-ink-dimmer">
                a five-rung ladder, never the answer first
              </p>
            </div>
            <button
              onClick={() => setDrawer(null)}
              className="rounded-lg border border-line px-2 py-1 font-mono text-[10.5px] text-ink-dim hover:text-fg"
            >
              close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <HintLadder
              topicId={topicId}
              sessionId={sessionId}
              onSessionId={setSessionId}
              code={code}
              language="python"
            />
          </div>
        </aside>

        <aside
          className={`fixed right-0 top-0 z-40 flex h-full w-[min(560px,96vw)] flex-col border-l border-line bg-surface-1 shadow-2xl transition-transform duration-300 ${
            drawer === "code" ? "translate-x-0" : "translate-x-full"
          }`}
          aria-hidden={drawer !== "code"}
        >
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-orange/15 font-mono text-[12px] font-bold text-brand-orange ring-1 ring-brand-orange/30">
              ⌘
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-fg">Code Playground</h2>
              <p className="font-mono text-[10.5px] text-ink-dimmer">
                write it, run it, measure it
              </p>
            </div>
            <button
              onClick={() => setDrawer(null)}
              className="rounded-lg border border-line px-2 py-1 font-mono text-[10.5px] text-ink-dim hover:text-fg"
            >
              close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <LabPanel
              code={code}
              onCodeChange={setCode}
              topicId={topicId}
              sessionId={sessionId}
            />
          </div>
        </aside>

        {/* Fixed launchers, bottom-right, stacked above the mascot. */}
        <div className="fixed bottom-24 right-5 z-20 flex flex-col items-end gap-2">
          <button
            onClick={() => setDrawer(drawer === "code" ? null : "code")}
            className="rounded-xl border border-brand-orange/40 bg-surface-2 px-4 py-2.5 text-[12.5px] font-semibold text-brand-orange shadow-lg transition hover:bg-surface-3"
          >
            ⌘ Open Code Playground
          </button>
          <button
            onClick={() => setDrawer(drawer === "coach" ? null : "coach")}
            className="rounded-xl border border-brand/40 bg-surface-2 px-4 py-2.5 text-[12.5px] font-semibold text-brand shadow-lg transition hover:bg-surface-3"
          >
            N Ask Nexus
          </button>
        </div>
      </div>
    </div>
  );
}

function LabPanel({
  code,
  onCodeChange,
  topicId,
  sessionId,
}: {
  code: string;
  onCodeChange: (next: string) => void;
  topicId: string;
  sessionId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{
    status: string;
    stdout: string;
    stderr: string;
    runtimeMs: number;
    timeComplexity?: string;
    spaceComplexity?: string;
    rejectionReason?: string;
  } | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/exec/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          language: "python",
          topicId,
          // `sessionId` is `null` until the coach opens a session. Zod's
          // `.optional()` accepts `undefined`, not `null`, so sending the null
          // made every run fail validation with "Invalid request." — the
          // original cause of "the run button never works".
          sessionId: sessionId ?? undefined,
        }),
      });
      // A non-JSON body (proxy error, 500 HTML page) would throw on .json().
      // Read text first so the real status is reported instead of a parse error.
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        throw new Error(`Server returned ${res.status}: ${raw.slice(0, 200) || "empty response"}`);
      }
      if (!res.ok) {
        throw new Error(
          (data.error as string) || `Request failed with status ${res.status}`,
        );
      }
      const analysis = (data.analysis ?? {}) as {
        timeComplexity?: string;
        spaceComplexity?: string;
      };
      setOut({
        status: (data.status as string) ?? "unknown",
        stdout: (data.stdout as string) ?? "",
        stderr: (data.stderr as string) ?? "",
        runtimeMs: Number(data.runtimeMs ?? 0),
        timeComplexity: analysis.timeComplexity,
        spaceComplexity: analysis.spaceComplexity,
        // The sandbox explains every rejection ("There is no code to run.",
        // "Code is too long."). Dropping it turned a precise error into a pink
        // tag that read as a broken button.
        rejectionReason: (data.rejectionReason as string) ?? undefined,
      });
    } catch (err) {
      setOut({
        status: "error",
        stdout: "",
        stderr: "",
        runtimeMs: 0,
        rejectionReason: `Execution failed: ${(err as Error).message}`,
      });
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
          className="rounded-lg bg-brand-orange px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "running…" : "run"}
        </button>
        {out?.timeComplexity && (
          <span className="font-mono text-[11px] text-ink-dimmer">
            {out.timeComplexity} / {out.spaceComplexity}
          </span>
        )}
        {out && (
          <span className="ml-auto font-mono text-[11px] text-ink-dimmer">{out.runtimeMs}ms</span>
        )}
      </div>

      <CodeEditor value={code} onChange={onCodeChange} height="260px" />

      {out && (
        <div
          className={`rounded-xl border p-3 ${
            out.status === "ok"
              ? "border-line bg-surface-1"
              : "border-brand-pink/40 bg-brand-pink/[0.06]"
          }`}
        >
          <div
            className={`mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
              out.status === "ok" ? "text-brand" : "text-brand-pink"
            }`}
          >
            {out.status}
          </div>
          {out.rejectionReason && (
            <p className="mb-2 rounded-lg border border-brand-pink/30 bg-brand-pink/10 px-3 py-2 text-[12.5px] leading-relaxed text-brand-pink">
              {out.rejectionReason}
            </p>
          )}
          {out.stdout && (
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg">
              {out.stdout}
            </pre>
          )}
          {out.stderr && (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-brand-pink">
              {out.stderr}
            </pre>
          )}
          {out.status === "ok" && !out.stdout && !out.stderr && (
            <p className="text-[12.5px] text-ink-dim">
              Ran cleanly and printed nothing. Add a <code className="font-mono">print()</code> to see a value.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
