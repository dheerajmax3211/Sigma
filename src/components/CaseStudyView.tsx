"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import type { CaseStudy } from "@/lib/content/schema";
import { renderMathIn } from "@/lib/render/markdown";
import { CapacityCalculator } from "@/components/CapacityCalculator";
import { DecisionTree, type DecisionOption } from "@/components/DecisionTree";

/**
 * The case-study reader.
 *
 * A 10,000-word blueprint rendered as one column is a document nobody finishes:
 * the reader scrolls, loses the thread, and leaves. The content was never the
 * problem — the delivery was. So the page is split into four questions a reader
 * actually arrives with (what happened, how is it built, what does it cost, how
 * will I be probed), with a five-line summary that is always on screen so the
 * tabs never become a maze.
 *
 * Every sentence in `why` below is a plain-language reason to read the block
 * that follows it. They are deliberately generic and hand-written: the page
 * must not invent a fact about the note, and a model writing connective tissue
 * between real fields is exactly how a case study acquires claims its sources
 * never made.
 */

type OtherNote = { id: string; title: string; kind: CaseStudy["kind"] };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "capacity", label: "Capacity Math" },
  { id: "interview", label: "Interview Probes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CaseStudyView({ note, others }: { note: CaseStudy; others: OtherNote[] }) {
  const [tab, setTab] = useState<TabId>("overview");
  // −1 = every dive collapsed. The architecture tab now opens with the
  // commit-then-reveal trees, and an open dive would show the tradeoff cards
  // before the learner has picked, which is the one thing this page is trying
  // not to do.
  const [openDive, setOpenDive] = useState(-1);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set<number>());
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * The one-minute version. Preference order is real fields only, and never
   * more than five bullets: key facts are the numbers worth memorising, then
   * what to steal, then the lessons. A note with none of the three simply does
   * not get the block rather than getting an invented one.
   */
  const brief = (
    note.key_facts.length > 0
      ? note.key_facts
      : note.what_to_steal.length > 0
        ? note.what_to_steal
        : note.lessons
  ).slice(0, 5);

  const arithmetic = note.capacity_estimation?.arithmetic ?? [];
  const assumptions = note.capacity_estimation?.assumptions ?? [];

  const counts: Record<TabId, number> = {
    overview: 0,
    architecture: note.deep_dives.length,
    capacity: arithmetic.length,
    interview: note.interview_questions.length,
  };

  // A link that appears as both a source and further reading is still one
  // link; showing it twice makes the footer look padded.
  const sourceKeys = new Set(note.sources.map((s) => s.url ?? s.label));
  const further = note.further_reading.filter((f) => !sourceKeys.has(f.url ?? f.label));

  function selectTab(next: TabId) {
    setTab(next);
    // Switching tabs while scrolled deep into a long panel would otherwise drop
    // the reader into the middle of unrelated content.
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && panel.getBoundingClientRect().top < 64) {
        panel.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const { key } = event;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") return;
    event.preventDefault();
    const last = TABS.length - 1;
    const next =
      key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : key === "Home"
            ? 0
            : last;
    selectTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  function toggleQuestion(index: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const allRevealed =
    note.interview_questions.length > 0 && revealed.size >= note.interview_questions.length;

  function toggleAllQuestions() {
    if (allRevealed) {
      setRevealed(new Set<number>());
      return;
    }
    setRevealed(new Set(note.interview_questions.map((_, i) => i)));
  }

  return (
    <article className="mx-auto max-w-[920px] px-5 py-8">
      <Link
        href="/notes"
        className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer transition hover:text-brand"
      >
        ← Case studies
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-brand">
          {note.kind === "playbook" ? "playbook" : "case study"}
        </span>
        {note.date && <span className="font-mono text-[11px] text-ink-dimmer">{note.date}</span>}
        {note.actors.map((actor) => (
          <span
            key={actor}
            className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink-dim"
          >
            {actor}
          </span>
        ))}
      </div>

      <h1 className="mt-3 text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] text-fg">
        {note.title}
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-dim">{note.summary}</p>

      {brief.length > 0 && (
        <section className="mt-6 rounded-2xl border border-brand/25 bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-brand">
              60-second version
            </h2>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
              {brief.length} line{brief.length === 1 ? "" : "s"} · always visible
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
            If you read nothing else on this page, read this — it is the version you should be able
            to say out loud.
          </p>
          <ul className="mt-3 space-y-2">
            {brief.map((fact, index) => (
              <li key={index} className="flex gap-3 text-[13.5px] leading-relaxed text-fg/90">
                <span className="mt-0.5 font-mono text-[11px] text-brand/70">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <Tex source={fact} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="sticky top-14 z-30 mt-6 border-y border-line bg-bg/90 backdrop-blur-md">
        <div
          role="tablist"
          aria-label="Case study sections"
          className="flex gap-1 overflow-x-auto py-1.5"
        >
          {TABS.map((entry, index) => {
            const active = tab === entry.id;
            const count = counts[entry.id];
            return (
              <button
                key={entry.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${entry.id}`}
                aria-selected={active}
                aria-controls={`panel-${entry.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(entry.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition ${
                  active
                    ? "bg-brand/10 text-brand ring-1 ring-brand/25"
                    : "text-ink-dimmer hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {entry.label}
                {count > 0 && (
                  <span
                    className={`hidden rounded px-1 font-mono text-[9px] sm:inline ${
                      active ? "bg-brand/15 text-brand/80" : "bg-surface-3 text-ink-dimmer"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Panel ────────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="scroll-mt-32 pt-1 focus:outline-none"
      >
        {tab === "overview" && <OverviewPanel note={note} />}
        {tab === "architecture" && (
          <ArchitecturePanel note={note} openDive={openDive} setOpenDive={setOpenDive} />
        )}
        {tab === "capacity" && <CapacityPanel note={note} assumptions={assumptions} />}
        {tab === "interview" && (
          <InterviewPanel
            note={note}
            revealed={revealed}
            onToggle={toggleQuestion}
            allRevealed={allRevealed}
            onToggleAll={toggleAllQuestions}
          />
        )}
      </div>

      {/* ── Footer: always visible, outside the tab state ─────────────── */}
      <footer className="mt-10 border-t border-line pt-5">
        {(note.sources.length > 0 || further.length > 0) && (
          <div className="grid gap-6 sm:grid-cols-2">
            {note.sources.length > 0 && <LinkList title="Sources" items={note.sources} />}
            {further.length > 0 && <LinkList title="Go deeper" items={further} />}
          </div>
        )}

        {others.length > 0 && (
          <div className="mt-8">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
              Next
            </h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {others.map((other) => (
                <Link
                  key={other.id}
                  href={`/note/${other.id}`}
                  className="rounded-xl border border-line bg-surface-1 px-4 py-3 transition hover:border-line-2 hover:bg-surface-2"
                >
                  <p className="text-[13px] font-medium text-fg">{other.title}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                    {other.kind === "playbook" ? "playbook" : "case study"}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
          <span className="mr-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
            {note.id}
          </span>
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-line bg-surface-1 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-dimmer"
            >
              {tag}
            </span>
          ))}
        </div>
      </footer>
    </article>
  );
}

/**
 * One sentence of a dive explanation, used as the `when` line of a decision
 * option. Deliberately dumb: it must never paraphrase, only cut. A sentence
 * that runs past the cap is truncated with an ellipsis rather than rewritten,
 * because a rewritten sentence is a claim the note did not make.
 */
function firstSentence(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const match = flat.match(/^(.+?[.!?])(?=\s+["“A-Z0-9]|$)/);
  const sentence = match ? match[1] : flat;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max).trimEnd().replace(/[,;:—–-]$/, "")}…`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────────────────────────────────────

function OverviewPanel({ note }: { note: CaseStudy }) {
  const requirements = note.requirements;
  const functional = requirements?.functional ?? [];
  const nonFunctional = requirements?.non_functional ?? [];
  const hasRequirements = functional.length > 0 || nonFunctional.length > 0;

  const empty =
    !note.problem_statement &&
    !hasRequirements &&
    note.clarifying_questions.length === 0 &&
    note.timeline.length === 0 &&
    note.key_facts.length === 0 &&
    note.decisions.length === 0 &&
    note.steps.length === 0;

  if (empty) {
    return (
      <Empty>
        This note has no overview material — the substance is in the architecture and interview
        tabs.
      </Empty>
    );
  }

  return (
    <>
      {note.problem_statement && (
        <Section
          title="The problem, stated"
          why="Every decision below is a response to this constraint, so read it before the answers."
          accent="orange"
        >
          <div className="rounded-2xl border border-brand-orange/25 bg-surface-1 p-5">
            <p className="text-[14px] leading-relaxed text-fg/90">
              <Tex source={note.problem_statement} />
            </p>
          </div>
        </Section>
      )}

      {hasRequirements && (
        <Section
          title="Requirements"
          why="These are the promises the design gets judged against — write them down before you draw a box."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {functional.length > 0 && (
              <div className="rounded-xl border border-line bg-surface-1 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand/80">
                  Functional
                </div>
                <ul className="mt-2 space-y-1.5">
                  {functional.map((item, index) => (
                    <li
                      key={index}
                      className="flex gap-2 text-[12.5px] leading-relaxed text-ink-dim"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand/70" />
                      <span>
                        <Tex source={item} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {nonFunctional.length > 0 && (
              <div className="rounded-xl border border-line bg-surface-1 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-orange/80">
                  Non-functional
                </div>
                <ul className="mt-2 space-y-1.5">
                  {nonFunctional.map((item, index) => (
                    <li
                      key={index}
                      className="flex gap-2 text-[12.5px] leading-relaxed text-ink-dim"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand-orange/70" />
                      <span>
                        <Tex source={item} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {note.clarifying_questions.length > 0 && (
        <Section
          title="What you must clarify first"
          why="Interviewers open here: they want to hear what you must clarify before drawing anything."
        >
          <ol className="space-y-2">
            {note.clarifying_questions.map((entry, index) => (
              <li key={index} className="rounded-xl border border-line bg-surface-1 p-4">
                <p className="flex gap-2.5 text-[13.5px] font-medium leading-relaxed text-fg">
                  <span className="mt-0.5 font-mono text-[11px] text-brand/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{entry.question}</span>
                </p>
                <p className="mt-1.5 pl-[26px] text-[12.5px] leading-relaxed text-ink-dim">
                  <span className="font-semibold text-brand">Why it matters: </span>
                  <Tex source={entry.why_it_matters} />
                </p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {note.timeline.length > 0 && (
        <Section
          title="What happened, in order"
          why="The shipping order explains the design better than any architecture diagram does."
        >
          <ol>
            {note.timeline.map((entry, index) => (
              <li key={index} className="flex gap-4 border-l border-line py-2 pl-4">
                <span className="w-24 shrink-0 font-mono text-[11px] text-brand/80">
                  {entry.when}
                </span>
                <span className="text-[13px] leading-relaxed text-ink-dim">{entry.what}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {note.key_facts.length > 0 && (
        <Section
          title="The facts"
          why="The numbers worth being able to repeat from memory, without the page in front of you."
        >
          <Bullets items={note.key_facts} />
        </Section>
      )}

      {note.decisions.length > 0 && (
        <Section
          title="Decisions and what they cost"
          why="Every choice here bought something and paid for it; if you cannot name the cost, you do not own the decision."
        >
          <div className="space-y-2">
            {note.decisions.map((decision, index) => (
              <div key={index} className="rounded-xl border border-line bg-surface-1 p-4">
                <p className="text-[13.5px] font-medium leading-relaxed text-fg">
                  {decision.choice}
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <p className="text-[12.5px] leading-relaxed text-ink-dim">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand">
                      why
                    </span>
                    <br />
                    <Tex source={decision.why} />
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-ink-dim">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand-orange/80">
                      cost
                    </span>
                    <br />
                    <Tex source={decision.cost} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {note.steps.length > 0 && (
        <Section
          title="Do this, in order"
          why="Each step assumes the previous one is already true, so skipping ahead is how playbooks fail."
        >
          <ol className="space-y-2">
            {note.steps.map((step, index) => (
              <li key={index} className="rounded-xl border border-line bg-surface-1 px-4 py-3">
                <p className="text-[13.5px] font-medium text-fg">
                  <span className="mr-2 font-mono text-[11px] text-brand">{index + 1}.</span>
                  {step.step}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{step.detail}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}

function ArchitecturePanel({
  note,
  openDive,
  setOpenDive,
}: {
  note: CaseStudy;
  openDive: number;
  setOpenDive: (index: number) => void;
}) {
  /**
   * The two decisions the note argues hardest about, taken straight from the
   * deep dives: question = the dive's topic, options = the tradeoffs it already
   * publishes. Nothing here is generated — a dive with fewer than two
   * tradeoffs is not a choice and is skipped, and the note's own `pros`/`cons`
   * become the verdict and the cost. `when` has no per-tradeoff field in the
   * content model, so it falls back to the dive's own framing rather than a
   * "choose this when" sentence the note never wrote.
   */
  const decisionPoints = note.deep_dives
    .filter((dive) => dive.tradeoffs.length >= 2)
    .slice(0, 2)
    .map((dive) => {
      const context = firstSentence(dive.explanation);
      const options: DecisionOption[] = dive.tradeoffs.map((tradeoff, index) => ({
        id: `option-${index}`,
        label: tradeoff.option,
        verdict: tradeoff.pros,
        cost: tradeoff.cons,
        when: context,
      }));
      return { question: dive.topic, options };
    });

  if (!note.architecture_summary && note.deep_dives.length === 0) {
    return (
      <Empty>
        This note has no architecture notes. Playbooks skip straight to the steps; case studies
        carry the diagram in prose.
      </Empty>
    );
  }

  return (
    <>
      {note.architecture_summary && (
        <Section
          title="The architecture in one breath"
          why="One paragraph for the whole system, so the details that follow have somewhere to attach."
        >
          <div className="rounded-2xl border border-line bg-surface-1 p-5">
            <p className="text-[13.5px] leading-relaxed text-ink-dim">
              <Tex source={note.architecture_summary} />
            </p>
          </div>
        </Section>
      )}

      {decisionPoints.length > 0 && (
        <Section
          title="Commit to a choice"
          why="Pick before you read the comparison — that is what the interview asks you to do."
        >
          <div className="space-y-2">
            {decisionPoints.map((point, index) => (
              <DecisionTree key={index} question={point.question} options={point.options} />
            ))}
          </div>
        </Section>
      )}

      {note.deep_dives.length > 0 && (
        <Section
          title="Deep dives and the tradeoffs"
          why="This is where the interview actually happens — open one and argue the tradeoff out loud."
        >
          <div className="space-y-2">
            {note.deep_dives.map((dive, index) => {
              const open = openDive === index;
              return (
                <div
                  key={index}
                  className="overflow-hidden rounded-xl border border-line bg-surface-1"
                >
                  <button
                    type="button"
                    onClick={() => setOpenDive(open ? -1 : index)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <span className="mt-0.5 font-mono text-[11px] text-brand/70">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-[13.5px] font-medium leading-relaxed text-fg">
                      {dive.topic}
                    </span>
                    <span
                      className={`font-mono text-[14px] leading-none ${
                        open ? "text-brand" : "text-ink-dimmer"
                      }`}
                    >
                      {open ? "−" : "+"}
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-line px-4 py-3">
                      <p className="text-[13px] leading-relaxed text-ink-dim">
                        <Tex source={dive.explanation} />
                      </p>

                      {dive.tradeoffs.length > 0 && (
                        <>
                          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                            Tradeoffs
                          </p>
                          <div className="mt-2 grid gap-2 lg:grid-cols-2">
                            {dive.tradeoffs.map((tradeoff, tradeoffIndex) => (
                              <div
                                key={tradeoffIndex}
                                className="rounded-lg border border-line bg-surface-2 p-3"
                              >
                                <p className="text-[12.5px] font-semibold text-fg">
                                  {tradeoff.option}
                                </p>
                                <p className="mt-1.5 flex gap-2 text-[12px] leading-relaxed text-ink-dim">
                                  <span className="shrink-0 font-mono text-brand">+</span>
                                  <span>{tradeoff.pros}</span>
                                </p>
                                <p className="mt-1 flex gap-2 text-[12px] leading-relaxed text-ink-dim">
                                  <span className="shrink-0 font-mono text-brand-orange">−</span>
                                  <span>{tradeoff.cons}</span>
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}

function CapacityPanel({ note, assumptions }: { note: CaseStudy; assumptions: string[] }) {
  const arithmetic = note.capacity_estimation?.arithmetic ?? [];

  return (
    <>
      {assumptions.length > 0 && (
        <Section
          title="Assumptions"
          why="Every number below is only as good as these inputs; change one and the whole design changes."
        >
          <ul className="space-y-1.5 rounded-xl border border-line bg-surface-1 p-4">
            {assumptions.map((assumption, index) => (
              <li key={index} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-dim">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand/60" />
                <span>
                  <Tex source={assumption} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {arithmetic.length > 0 ? (
        <Section
          title="The arithmetic, written out"
          why="Interviewers ask you to do this out loud, so here it is in the order you would say it."
        >
          <div className="space-y-2">
            {arithmetic.map((entry, index) => (
              <div key={index} className="rounded-xl border border-line bg-surface-1 p-4">
                <p className="text-[13px] font-semibold text-fg">{entry.label}</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-4 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-brand">
                  {entry.calculation}
                </pre>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
                  <Tex source={entry.conclusion} />
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <Section
          title="The arithmetic, written out"
          why="Interviewers ask you to do this out loud, so here it is in the order you would say it."
        >
          <Empty>
            This note does not publish its capacity arithmetic, so the calculator below starts from
            generic defaults rather than pretending to know its numbers.
          </Empty>
        </Section>
      )}

      <Section
        title="Run the numbers yourself"
        why="The arithmetic above is the note’s; these numbers are yours — move a slider and watch the node count change."
      >
        <CapacityCalculator assumptions={assumptions} />
      </Section>
    </>
  );
}

function InterviewPanel({
  note,
  revealed,
  onToggle,
  allRevealed,
  onToggleAll,
}: {
  note: CaseStudy;
  revealed: ReadonlySet<number>;
  onToggle: (index: number) => void;
  allRevealed: boolean;
  onToggleAll: () => void;
}) {
  const questions = note.interview_questions;

  const empty =
    questions.length === 0 &&
    note.what_to_steal.length === 0 &&
    note.lessons.length === 0 &&
    note.mistakes.length === 0 &&
    note.bottlenecks.length === 0;

  if (empty) {
    return <Empty>This note has no interview material yet.</Empty>;
  }

  return (
    <>
      {questions.length > 0 && (
        <Section
          title="What they will ask you"
          why="Answer out loud first, then reveal the rubric — the gap between the two is what you study."
          action={
            <button
              type="button"
              onClick={onToggleAll}
              className="rounded-md border border-line bg-surface-1 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer transition hover:border-line-2 hover:text-brand"
            >
              {allRevealed ? "hide all" : "reveal all"}
            </button>
          }
        >
          <div className="space-y-2">
            {questions.map((question, index) => {
              const open = revealed.has(index);
              const keyPoints = question.key_points.length;
              return (
                <div key={index} className="rounded-xl border border-line bg-surface-1 p-4">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 rounded bg-surface-4 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brand">
                      {question.level}
                    </span>
                    <p className="flex-1 text-[13.5px] font-medium leading-relaxed text-fg">
                      {question.question}
                    </p>
                  </div>

                  {(keyPoints > 0 || question.follow_up) && (
                    <button
                      type="button"
                      onClick={() => onToggle(index)}
                      aria-expanded={open}
                      className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer transition hover:text-brand"
                    >
                      {open
                        ? "− hide"
                        : keyPoints > 0
                          ? `+ reveal ${keyPoints} key point${keyPoints === 1 ? "" : "s"}`
                          : "+ reveal follow-up"}
                    </button>
                  )}

                  {open && keyPoints > 0 && (
                    <ul className="mt-2.5 space-y-1.5 border-l border-brand/25 pl-3">
                      {question.key_points.map((point, pointIndex) => (
                        <li
                          key={pointIndex}
                          className="flex gap-2 text-[12.5px] leading-relaxed text-ink-dim"
                        >
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                          <span>
                            <Tex source={point} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {open && question.follow_up && (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
                      <span className="font-semibold text-brand-orange/90">Follow-up: </span>
                      {question.follow_up}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {note.what_to_steal.length > 0 && (
        <Section
          title="What to steal"
          why="The transferable moves, with the company stripped off."
        >
          <Bullets items={note.what_to_steal} />
        </Section>
      )}

      {note.lessons.length > 0 && (
        <Section
          title="The lessons"
          why="The two sentences you would repeat to a colleague the next morning."
        >
          <Bullets items={note.lessons} />
        </Section>
      )}

      {note.mistakes.length > 0 && (
        <Section
          title="What people get wrong"
          why="Recognising the mistake is half of answering the question about it."
        >
          <ul className="space-y-2">
            {note.mistakes.map((mistake, index) => (
              <li
                key={index}
                className="flex gap-2.5 text-[13px] leading-relaxed text-ink-dim"
              >
                <span className="mt-0.5 shrink-0 font-mono text-[12px] text-brand-orange/80">✕</span>
                <span>
                  <Tex source={mistake} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {note.bottlenecks.length > 0 && (
        <Section
          title="What breaks first"
          why="Every system fails somewhere; knowing the first failure is the difference between debugging and panicking."
        >
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="hidden grid-cols-3 gap-3 bg-surface-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer sm:grid">
              <span>Failure</span>
              <span>Symptom</span>
              <span>Mitigation</span>
            </div>
            {note.bottlenecks.map((bottleneck, index) => (
              <div
                key={index}
                className={`grid gap-2 bg-surface-1 px-4 py-3 sm:grid-cols-3 sm:gap-3 ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="text-[12.5px] font-medium leading-relaxed text-fg">
                  {bottleneck.failure}
                </span>
                <span className="text-[12.5px] leading-relaxed text-brand-orange/90">
                  {bottleneck.symptom}
                </span>
                <span className="text-[12.5px] leading-relaxed text-ink-dim">
                  {bottleneck.mitigation}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A section header plus the one sentence that says why the section is worth
 * reading. Keeping the sentence mandatory means every block earns its space.
 */
function Section({
  title,
  why,
  accent = "brand",
  action,
  children,
}: {
  title: string;
  why: string;
  accent?: "brand" | "orange" | "muted";
  action?: ReactNode;
  children: ReactNode;
}) {
  const tone =
    accent === "brand"
      ? "text-brand"
      : accent === "orange"
        ? "text-brand-orange/90"
        : "text-ink-dimmer";

  return (
    <section className="mt-7 first:mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={`font-mono text-[10.5px] uppercase tracking-[0.18em] ${tone}`}>{title}</h2>
        {action}
      </div>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-dim">{why}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bullets({ items, tone = "brand" }: { items: string[]; tone?: "brand" | "orange" }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5 text-[13.5px] leading-relaxed text-fg/90">
          <span
            className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
              tone === "brand" ? "bg-brand/70" : "bg-brand-orange/70"
            }`}
          />
          <span>
            <Tex source={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function LinkList({ title, items }: { title: string; items: { label: string; url?: string }[] }) {
  return (
    <div>
      <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">{title}</h2>
      <ul className="mt-2 space-y-1">
        {items.map((item, index) => (
          <li key={index} className="text-[12px] leading-relaxed text-ink-dim">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line-2 underline-offset-2 transition hover:text-brand hover:decoration-brand/40"
              >
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * KaTeX through the shared renderer, deliberately not through the editor
 * module: importing `InlineMath` from CodeEditor would pull Monaco into a
 * reading page that never shows a code editor.
 */
function Tex({ source }: { source: string }) {
  const html = useMemo(() => renderMathIn(source), [source]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-xl border border-dashed border-line bg-surface-1/60 px-4 py-5 text-[13px] leading-relaxed text-ink-dimmer">
      {children}
    </p>
  );
}
