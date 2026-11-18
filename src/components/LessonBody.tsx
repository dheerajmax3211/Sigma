"use client";

import { useEffect, useState } from "react";
import { Markdown, InlineMath } from "@/components/CodeEditor";
import { DiagramList } from "@/components/diagrams/DiagramView";
import type { Diagram, InterviewQuestion, FurtherReading } from "@/lib/content/schema";

/**
 * The system-design block carried by track-07 case studies. Kept as a plain
 * structural type rather than a schema import so the component stays a pure
 * renderer.
 */
export type DesignBlock = {
  problem_statement?: string;
  requirements?: { functional: string[]; non_functional: string[] };
  clarifying_questions: { question: string; why_it_matters: string }[];
  capacity_estimation?: {
    assumptions: string[];
    arithmetic: { label: string; calculation: string; conclusion: string }[];
  };
  architecture_summary?: string;
  deep_dives: {
    topic: string;
    explanation: string;
    tradeoffs: { option: string; pros: string; cons: string }[];
  }[];
  bottlenecks: { failure: string; symptom: string; mitigation: string }[];
  what_to_steal: string[];
};

/**
 * The lesson body — optimised for *finishing*, not for completeness.
 *
 * Structured the way the reference app structures its lessons, because the structure is
 * where the pedagogy lives: big idea, why it matters, one analogy, then the
 * core ideas one at a time, then the long form.
 *
 * The reading load is the thing that kills completion, so everything past the
 * first screen is collapsed by default:
 *
 *   - concept points show three lines and expand on click
 *   - the long-form write-up sits behind one disclosure
 *   - diagrams and glossary stay visible because they are scanned, not read
 *
 * Nothing is hidden from search or from the derived/code tabs; it is only
 * folded so a learner can see the shape of the topic before committing to it.
 */
export function LessonBody({
  bodyHtml,
  bigIdea,
  problem,
  analogy,
  conceptPoints,
  diagrams,
  definitions,
  tryIt,
  interviewQuestions,
  commonMistakes,
  furtherReading,
  design,
  initialStep = 0,
  nextTopic,
  trackHref,
}: {
  bodyHtml: string;
  bigIdea?: string;
  problem: string[];
  analogy?: string;
  conceptPoints: string[];
  diagrams: Diagram[];
  definitions: { term: string; meaning: string }[];
  tryIt?: string;
  interviewQuestions: InterviewQuestion[];
  commonMistakes: string[];
  furtherReading: FurtherReading[];
  design?: DesignBlock;
  /** Deep-linkable step (?step=N) so a step survives reload and can be tested. */
  initialStep?: number;
  /**
   * The next topic in this track, in `position` order. The CTA only renders
   * when the page supplies it — the component never invents course order.
   */
  nextTopic?: { id: string; title: string };
  /** Where the CTA points when this is the last topic in its track. */
  trackHref?: string;
}) {
  const [openPoints, setOpenPoints] = useState<Set<number>>(new Set());
  const [showAnalogy, setShowAnalogy] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  // Four steps, one visible at a time. A single 1,500-word scroll gives no
  // signal of progress and no place to stop; a stepper makes "how much is
  // left" answerable, which is the difference between finishing and abandoning.
  const [step, setStep] = useState(Math.min(3, Math.max(0, initialStep)));

  const toggle = (i: number) =>
    setOpenPoints((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="flex flex-col gap-7">
      {/* ── Stepper ─────────────────────────────────────────────────── */}
      <nav
        aria-label="Lesson steps"
        className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-1 px-4 py-3"
      >
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i)}
              className={`h-1.5 flex-1 rounded-full transition ${
                i < step ? "bg-brand/60" : i === step ? "bg-brand" : "bg-surface-4"
              }`}
              aria-label={`Go to step ${i + 1}: ${label}`}
            />
          ))}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand">
            Step {step + 1} of {STEPS.length}
          </span>
          <h2 className="text-[13px] font-medium text-fg">{STEPS[step]}</h2>
          <span className="ml-auto font-mono text-[10px] text-ink-dimmer">
            {STEP_HINTS[step]}
          </span>
        </div>
      </nav>
      {step === 0 && bigIdea && (
        <section className="rounded-2xl border border-brand/25 bg-brand/[0.05] p-5">
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
            The big idea
          </div>
          <p className="text-[16px] font-medium leading-relaxed text-fg">
            <InlineMath source={bigIdea} />
          </p>
        </section>
      )}

      {step === 0 && problem.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
            Why this matters
          </h2>
          <ul className="flex flex-col gap-2">
            {problem.map((p, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink-dim">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-brand-orange" />
                <span>
                  <InlineMath source={p} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 0 && analogy && (
        <section className="rounded-2xl border border-brand-violet/25 bg-brand-violet/[0.05]">
          <button
            onClick={() => setShowAnalogy((v) => !v)}
            className="flex w-full items-center gap-2 px-5 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-violet"
          >
            <span className="text-[13px]">◑</span> An analogy
            <span className="ml-auto font-mono text-[10px] normal-case tracking-normal text-ink-dimmer">
              {showAnalogy ? "hide" : "show"}
            </span>
          </button>
          {showAnalogy && (
            <div className="px-5 pb-5 text-[14px] leading-relaxed text-ink-dim">
              <Markdown source={analogy} />
            </div>
          )}
        </section>
      )}

      {step === 1 && conceptPoints.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
              The core ideas
            </h2>
            <span className="font-mono text-[10px] text-ink-dimmer">
              {openPoints.size === 0 ? "tap any to open" : `${openPoints.size} open`}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {conceptPoints.map((c, i) => {
              const open = openPoints.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`flex gap-3 rounded-xl border p-3.5 text-left transition ${
                    open
                      ? "border-brand/30 bg-surface-3"
                      : "border-line bg-surface-2 hover:border-line-2"
                  }`}
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-4 font-mono text-[11px] font-bold text-brand">
                    {i + 1}
                  </span>
                  <span
                    className={`text-[13.5px] leading-relaxed text-ink-dim ${
                      open ? "" : "line-clamp-3"
                    }`}
                  >
                    <InlineMath source={c} />
                  </span>
                  <span className="ml-auto mt-0.5 shrink-0 font-mono text-[10px] text-ink-dimmer">
                    {open ? "−" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 1 && (
        <RecallGate
          prompt={bigIdea ?? "Say the core idea in one sentence."}
          keyPoints={conceptPoints}
          onDone={() => setStep(2)}
        />
      )}

      {step === 2 && bodyHtml && (
        // The body is now the teaching, written as numbered steps with a code
        // fence and a spoken reading per step. It used to be a 12,000-character
        // specification, which is why it was hidden behind "Go deeper". Leaving
        // it closed now hides the lesson itself, so it opens by default.
        <details open className="group rounded-2xl border border-line bg-surface-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
              The walkthrough
            </span>
            <span className="text-[12.5px] text-ink-dim">
              every step, in order, with the numbers worked
            </span>
            <span className="ml-auto font-mono text-[10px] text-ink-dimmer group-open:hidden">
              expand
            </span>
            <span className="ml-auto hidden font-mono text-[10px] text-ink-dimmer group-open:inline">
              collapse
            </span>
          </summary>
          <div
            className="prose-i0 border-t border-line px-5 py-4"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </details>
      )}

      {step === 2 && <DiagramList diagrams={diagrams} />}

      {step === 2 && definitions.length > 0 && (
        <details className="rounded-2xl border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2 bg-surface-1 px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
              Glossary
            </span>
            <span className="font-mono text-[11px] text-ink-dim">{definitions.length}</span>
            <span className="ml-auto font-mono text-[10px] text-ink-dimmer group-open:hidden">
              expand
            </span>
          </summary>
          <dl className="overflow-hidden">
            {definitions.map((d, i) => (
              <div
                key={i}
                className={`bg-surface-1 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <dt className="text-[13.5px] font-semibold text-fg">
                  <InlineMath source={d.term} />
                </dt>
                <dd className="mt-1 text-[13.5px] leading-relaxed text-ink-dim">
                  <InlineMath source={d.meaning} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {step === 2 && design && (
        <>
          {(design.problem_statement || design.requirements) && (
            <section className="rounded-2xl border border-brand-orange/25 bg-surface-1 p-5">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange">
                The problem, stated
              </div>
              {design.problem_statement && (
                <p className="text-[14px] leading-relaxed text-fg">
                  <InlineMath source={design.problem_statement} />
                </p>
              )}
              {design.requirements && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {design.requirements.functional.length > 0 && (
                    <div>
                      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                        Functional
                      </div>
                      <ul className="flex flex-col gap-1">
                        {design.requirements.functional.map((r, i) => (
                          <li key={i} className="text-[12.5px] leading-relaxed text-ink-dim">
                            · {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {design.requirements.non_functional.length > 0 && (
                    <div>
                      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                        Non-functional
                      </div>
                      <ul className="flex flex-col gap-1">
                        {design.requirements.non_functional.map((r, i) => (
                          <li key={i} className="text-[12.5px] leading-relaxed text-ink-dim">
                            · {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {design.clarifying_questions.length > 0 && (
            <section>
              <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
                What you must clarify first
              </h2>
              <p className="mb-3 text-[12.5px] text-ink-dimmer">
                Each answer changes the architecture. Ask before you draw.
              </p>
              <div className="flex flex-col gap-2">
                {design.clarifying_questions.map((c, i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface-1 p-4">
                    <div className="text-[13.5px] font-medium text-fg">{c.question}</div>
                    <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">
                      <span className="font-semibold text-brand">Why it matters: </span>
                      <InlineMath source={c.why_it_matters} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {design.capacity_estimation && (
            <section>
              <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
                Capacity arithmetic
              </h2>
              <p className="mb-3 text-[12.5px] text-ink-dimmer">
                Every number below is derived. Reproduce it on a whiteboard.
              </p>
              {design.capacity_estimation.assumptions.length > 0 && (
                <ul className="mb-3 flex flex-col gap-1 rounded-xl border border-line bg-surface-1 p-4">
                  {design.capacity_estimation.assumptions.map((a, i) => (
                    <li key={i} className="text-[12.5px] leading-relaxed text-ink-dim">
                      · {a}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                {design.capacity_estimation.arithmetic.map((a, i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface-1 p-4">
                    <div className="text-[13px] font-semibold text-fg">{a.label}</div>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-4 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-brand">
                      {a.calculation}
                    </pre>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
                      <InlineMath source={a.conclusion} />
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {design.architecture_summary && (
            <section className="rounded-2xl border border-line bg-surface-1 p-5">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-dimmer">
                The architecture
              </div>
              <p className="text-[13.5px] leading-relaxed text-ink-dim">
                <InlineMath source={design.architecture_summary} />
              </p>
            </section>
          )}

          {design.deep_dives.length > 0 && (
            <section>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
                Deep dives and the tradeoffs
              </h2>
              <div className="flex flex-col gap-4">
                {design.deep_dives.map((d, i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface-1 p-4">
                    <div className="text-[14px] font-semibold text-fg">{d.topic}</div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
                      <InlineMath source={d.explanation} />
                    </p>
                    {d.tradeoffs.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {d.tradeoffs.map((t, j) => (
                          <div key={j} className="rounded-lg border border-line bg-surface-2 p-3">
                            <div className="text-[12.5px] font-semibold text-fg">{t.option}</div>
                            <div className="mt-1.5 text-[12px] leading-relaxed text-brand">
                              + {t.pros}
                            </div>
                            <div className="mt-1 text-[12px] leading-relaxed text-brand-orange">
                              − {t.cons}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {design.bottlenecks.length > 0 && (
            <section>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
                What breaks first
              </h2>
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="hidden grid-cols-3 gap-3 bg-surface-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer sm:grid">
                  <span>Failure</span>
                  <span>Symptom</span>
                  <span>Mitigation</span>
                </div>
                {design.bottlenecks.map((b, i) => (
                  <div
                    key={i}
                    className={`grid gap-2 bg-surface-1 px-4 py-3 sm:grid-cols-3 sm:gap-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <span className="text-[12.5px] font-medium text-fg">{b.failure}</span>
                    <span className="text-[12.5px] leading-relaxed text-brand-orange">{b.symptom}</span>
                    <span className="text-[12.5px] leading-relaxed text-ink-dim">{b.mitigation}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {design.what_to_steal.length > 0 && (
            <section className="rounded-2xl border border-brand/25 bg-brand/[0.05] p-5">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
                What to steal
              </div>
              <ul className="flex flex-col gap-1.5">
                {design.what_to_steal.map((w, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink-dim">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                    <span>
                      <InlineMath source={w} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ── The loop. The reference app closes every teaching unit by asking for
             production; without this the page is readable and therefore
             forgettable. ─────────────────────────────────────────────── */}
      {step === 3 && tryIt && (
        <TryItCard text={tryIt} />
      )}

      {step === 3 && interviewQuestions.length > 0 && (
        <section>
          <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
            What they will ask you
          </h2>
          <p className="mb-3 text-[12.5px] text-ink-dimmer">
            Say your answer out loud first — the model answer stays hidden until you ask for it.
          </p>
          <div className="flex flex-col gap-2">
            {interviewQuestions.map((q, i) => {
              const open = revealed.has(i);
              return (
                <div key={i} className="rounded-xl border border-line bg-surface-1">
                  <button
                    onClick={() =>
                      setRevealed((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    className="flex w-full items-start gap-3 p-4 text-left"
                  >
                    <span className="mt-0.5 rounded bg-surface-4 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brand">
                      {q.level}
                    </span>
                    <span className="flex-1 text-[14px] font-medium leading-relaxed text-fg">
                      {q.question}
                    </span>
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] text-ink-dimmer">
                      {open ? "hide model answer" : "show model answer"}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-line px-4 py-3">
                      {q.key_points.length > 0 && (
                        <ul className="flex flex-col gap-1.5">
                          {q.key_points.map((k, j) => (
                            <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-ink-dim">
                              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                              <span>{k}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.follow_up && (
                        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
                          <span className="font-semibold text-brand-orange">Follow-up: </span>
                          {q.follow_up}
                        </p>
                      )}
                      {q.model_answer && (
                        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
                          <span className="font-semibold text-fg">Model answer: </span>
                          <InlineMath source={q.model_answer} />
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {step === 3 && commonMistakes.length > 0 && (
        <section className="rounded-2xl border border-brand-pink/40 bg-brand-pink/[0.07] p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-pink/15 text-[14px] text-brand-pink">
              ⚠
            </span>
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-brand-pink">
              Watch out for this
            </h2>
          </div>
          <p className="mt-2 text-[12.5px] text-ink-dim">
            These are the exact traps that cost candidates the round.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {commonMistakes.map((m, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-fg/90">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-pink" />
                <span>
                  <InlineMath source={m} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 3 && furtherReading.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
            Go deeper
          </h2>
          <ul className="flex flex-wrap gap-2">
            {furtherReading.map((r, i) =>
              r.url ? (
                <li key={i}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-[12.5px] text-ink-dim transition hover:border-line-2 hover:text-fg"
                  >
                    {r.label} ↗
                  </a>
                </li>
              ) : (
                <li
                  key={i}
                  className="inline-block rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-[12.5px] text-ink-dim"
                >
                  {r.label}
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {/* ── Step navigation ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          onClick={() => setStep((v) => Math.max(0, v - 1))}
          disabled={step === 0}
          className="rounded-xl border border-line px-4 py-2 text-[13px] text-ink-dim transition hover:border-line-2 hover:text-fg disabled:opacity-40"
        >
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((v) => Math.min(STEPS.length - 1, v + 1))}
            className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-[#04140f] transition hover:bg-brand/90"
          >
            Next: {STEPS[step + 1]} →
          </button>
        ) : nextTopic ? (
          <>
            <a
              href={`/topic/${nextTopic.id}`}
              className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-[#04140f] transition hover:bg-brand/90"
            >
              Next: {nextTopic.title} →
            </a>
            <a
              href="#top"
              className="ml-auto font-mono text-[10.5px] text-ink-dimmer transition hover:text-fg"
            >
              ✓ topic complete · back to top
            </a>
          </>
        ) : (
          <a
            href={trackHref ?? "#top"}
            className="rounded-xl border border-brand/40 px-4 py-2 text-[13px] font-medium text-brand transition hover:bg-brand/10"
          >
            {trackHref ? "✓ Topic complete — back to the track" : "✓ Topic complete — back to top"}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The micro-exercise, as a timed drill rather than a paragraph.
 *
 * A sentence beginning "Take a moment to..." is read and skipped. A card with a
 * start button and a countdown is not: it asks for a decision, and the timer
 * makes the cost of skipping visible. The timer is deliberately 2 minutes —
 * long enough to attempt the arithmetic, short enough that starting is cheap.
 */
function TryItCard({ text }: { text: string }) {
  const TOTAL = 120;
  const [left, setLeft] = useState(TOTAL);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    if (state !== "running") return;
    if (left <= 0) {
      setState("done");
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [state, left]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const pct = ((TOTAL - left) / TOTAL) * 100;

  return (
    <section
      className={`rounded-2xl border p-5 ${
        state === "running"
          ? "border-brand-orange/60 bg-brand-orange/[0.10]"
          : "border-brand-orange/35 bg-brand-orange/[0.06]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange">
          Drill · do this now
        </div>
        {state === "running" && (
          <div className="ml-auto font-mono text-[15px] font-bold tabular-nums text-brand-orange">
            {mm}:{ss}
          </div>
        )}
        {state === "done" && (
          <div className="ml-auto font-mono text-[11px] uppercase tracking-[0.1em] text-brand">
            time up — check your work
          </div>
        )}
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-fg">
        <InlineMath source={text} />
      </p>

      {state === "running" && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-4">
          <div
            className="h-full rounded-full bg-brand-orange transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2.5">
        {state === "idle" && (
          <>
            <button
              onClick={() => {
                setLeft(TOTAL);
                setState("running");
              }}
              className="rounded-lg bg-brand-orange px-3.5 py-1.5 text-[12.5px] font-semibold text-[#1a0d02] transition hover:bg-brand-orange/90"
            >
              Start the exercise · 2:00
            </button>
            <span className="font-mono text-[10.5px] text-ink-dimmer">
              no notes, no scrolling
            </span>
          </>
        )}
        {state === "running" && (
          <>
            <button
              onClick={() => setState("done")}
              className="rounded-lg border border-brand/40 px-3.5 py-1.5 text-[12.5px] font-medium text-brand transition hover:bg-brand/10"
            >
              I finished
            </button>
            <button
              onClick={() => {
                setLeft(TOTAL);
                setState("idle");
              }}
              className="font-mono text-[10.5px] text-ink-dimmer hover:text-fg"
            >
              reset
            </button>
          </>
        )}
        {state === "done" && (
          <>
            <button
              onClick={() => {
                setLeft(TOTAL);
                setState("idle");
              }}
              className="rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] text-ink-dim transition hover:border-line-2 hover:text-fg"
            >
              Do it again
            </button>
            <span className="font-mono text-[10.5px] text-brand">
              ✓ logged as attempted
            </span>
          </>
        )}
      </div>
    </section>
  );
}

/** The four steps a topic is delivered in. */
const STEPS = ["The idea", "The mechanism", "Visual & math", "Rehearse"] as const;
const STEP_HINTS = [
  "why this exists",
  "the six things that matter",
  "see it, then prove it",
  "now produce something",
] as const;

/**
 * A recall gate between the mechanism and the maths.
 *
 * Deliberately not a multiple-choice quiz: generated distractors would be
 * invented content. Instead it asks the learner to say the idea in their own
 * sentence and then judge honestly whether the sentence named a mechanism —
 * elaborative interrogation, with the self-assessment kept explicit.
 */
function RecallGate({
  prompt,
  keyPoints,
  onDone,
}: {
  prompt: string;
  keyPoints: string[];
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [verdict, setVerdict] = useState<null | "yes" | "no">(null);
  // Once a verdict is given, show the authored answer so the learner can compare
  // against the real thing. Without this the gate asks them to grade themselves
  // from memory of a page they just closed — which is not feedback, it is a guess.
  const [revealed, setRevealed] = useState(false);

  return (
    <section className="rounded-2xl border border-brand-violet/35 bg-brand-violet/[0.06] p-5">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-violet">
        Recall check · 20 seconds
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-dim">
        Close the page mentally. In one sentence, what is the idea — not its name,
        the mechanism?
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        aria-label="Your one-sentence explanation of the idea"
        placeholder="The mechanism is…"
        className="mt-3 w-full resize-y rounded-xl border border-line bg-surface-1 px-3 py-2 text-[13.5px] text-fg outline-none focus:border-line-2 focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setVerdict("yes"); setRevealed(true); }}
          disabled={text.trim().length < 12}
          className="rounded-lg border border-brand/40 px-3 py-1.5 text-[12.5px] text-brand transition hover:bg-brand/10 disabled:opacity-40"
        >
          Mine names a mechanism
        </button>
        <button
          onClick={() => { setVerdict("no"); setRevealed(true); }}
          className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-ink-dim transition hover:border-line-2 hover:text-fg"
        >
          Not yet — re-read the six points
        </button>
        {verdict === "yes" && (
          <button
            onClick={onDone}
            className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-[#04140f]"
          >
            Continue →
          </button>
        )}
        {verdict === "no" && (
          <span className="font-mono text-[11px] text-brand-orange">
            go back one step — that is the useful signal
          </span>
        )}
      </div>
      {revealed && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
            the authored answer
          </div>
          {prompt && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">
              <InlineMath source={prompt} />
            </p>
          )}
          {keyPoints.length > 0 && (
            <ul className="mt-2 space-y-1">
              {keyPoints.slice(0, 3).map((k, i) => (
                <li key={i} className="text-[12px] leading-relaxed text-ink-dimmer">
                  · {plainInline(k)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 font-mono text-[10px] text-ink-dimmer">
            if your sentence named something different, that is the gap — go back one step
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Key points are authored in markdown with inline LaTeX. In the compare panel
 * they are shown as prose, so the delimiters are stripped rather than rendered —
 * a literal `**` or `$N$` reads as a bug, not as notation.
 */
function plainInline(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\\\(([^)]+)\\\)/g, "$1");
}
