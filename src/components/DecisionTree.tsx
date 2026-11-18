"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * Commit-then-reveal trade-off decision tree.
 *
 * The comparison card teaches people to *read* a choice; it does not teach
 * them to *make* one. An interviewer asks "what would you pick, and what does
 * it cost you" — and the honest answer only exists if you commit before you
 * see the costs. So this widget hides every verdict, cost and applicability
 * note until the learner has picked, then shows all of them at once with the
 * learner's own pick marked. Seeing the road not taken is the point: you can
 * only regret a choice you actually made.
 *
 * The options are radios, not links: choosing one is a commitment, and the
 * arrow-key behaviour matches what a keyboard user already expects from a
 * radio group. Nothing here fetches, stores or derives — it is prop-driven and
 * owns exactly one piece of state.
 */

export type DecisionOption = {
  id: string;
  label: string;
  verdict: string;
  cost: string;
  when: string;
};

export type DecisionTreeProps = {
  question: string;
  options: DecisionOption[];
};

export function DecisionTree({ question, options }: DecisionTreeProps) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const baseId = useId();
  const questionId = `${baseId}-question`;
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // A single option is not a decision, and zero options cannot be rendered.
  if (options.length < 2) return null;

  const committed = chosenId !== null;
  const chosen = options.find((option) => option.id === chosenId) ?? null;

  /**
   * The content model has no per-tradeoff "when" field, so a caller deriving
   * `when` from one dive explanation hands every option the same sentence.
   * Printing it under all three cards reads as a defect; when the values agree
   * it is shown once, and only genuinely distinct values get a row per card.
   */
  const sharedWhen = (() => {
    const first = options[0]?.when.trim() ?? "";
    if (!first) return null;
    return options.every((option) => option.when.trim() === first) ? first : null;
  })();

  function commit(id: string) {
    setChosenId(id);
  }

  function reset() {
    setChosenId(null);
    // Reset must not strand the keyboard user: the options are back to being
    // the only thing on screen, so put focus back on the first one.
    optionRefs.current[0]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const { key } = event;
    if (key !== "ArrowRight" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowUp" && key !== "Home" && key !== "End") {
      return;
    }
    event.preventDefault();
    const last = options.length - 1;
    const next =
      key === "ArrowRight" || key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : key === "ArrowLeft" || key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : key === "Home"
            ? 0
            : last;
    optionRefs.current[next]?.focus();
  }

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={questionId} className="text-[13.5px] font-medium leading-relaxed text-fg">
          {question}
        </p>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
          {committed ? "committed" : "pick one"}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={questionId}
        className={`mt-3 grid gap-2 ${
          options.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
        }`}
      >
        {options.map((option, index) => {
          const active = option.id === chosenId;
          return (
            <button
              key={option.id}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!committed && index === 0) ? 0 : -1}
              onClick={() => commit(option.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active
                  ? "border-brand/50 bg-brand/10 text-fg ring-1 ring-brand/25"
                  : "border-line bg-surface-2 text-ink-dim hover:border-line-2 hover:text-fg"
              }`}
            >
              <span className="text-[12.5px] font-semibold leading-snug">{option.label}</span>
              {committed && (
                <span
                  className={`font-mono text-[9px] uppercase tracking-[0.12em] ${
                    active ? "text-brand" : "text-ink-dimmer"
                  }`}
                >
                  {active ? "your pick" : "option"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Announced, not drawn: the status carries the commit for screen readers
          without repeating the whole comparison into the live region. */}
      <p role="status" className="sr-only">
        {chosen
          ? `You committed to ${chosen.label}. The costs for every option are now shown.`
          : "No choice made yet."}
      </p>

      {committed && chosen && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
              the comparison, now that you have picked
            </p>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-line bg-surface-1 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer transition hover:border-line-2 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              reset
            </button>
          </div>

          <ul
            className={`mt-2 grid gap-2 ${
              options.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            {options.map((option) => {
              const active = option.id === chosenId;
              return (
                <li
                  key={option.id}
                  className={`rounded-lg border p-3 ${
                    active
                      ? "border-brand/40 bg-brand/[0.06]"
                      : "border-line bg-surface-2/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12.5px] font-semibold leading-snug text-fg">
                      {option.label}
                    </p>
                    {active && (
                      <span className="shrink-0 rounded border border-brand/40 bg-brand/15 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-brand">
                        your pick
                      </span>
                    )}
                  </div>

                  <dl className="mt-2 space-y-1.5">
                    <div className="flex gap-2">
                      <dt className="mt-[1px] shrink-0 font-mono text-[10px] text-brand">+</dt>
                      <dd className="text-[12px] leading-relaxed text-ink-dim">{option.verdict}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="mt-[1px] shrink-0 font-mono text-[10px] text-brand-orange">−</dt>
                      <dd className="text-[12px] leading-relaxed text-ink-dim">{option.cost}</dd>
                    </div>
                    {!sharedWhen && (
                      <div className="flex gap-2 border-t border-line/70 pt-1.5">
                        <dt className="mt-[1px] shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
                          when
                        </dt>
                        <dd className="text-[11.5px] leading-relaxed text-ink-dimmer">
                          {option.when}
                        </dd>
                      </div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>

          {sharedWhen && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-dimmer">
              <span className="mr-1.5 font-mono text-[9px] uppercase tracking-[0.1em]">
                when this comes up
              </span>
              {sharedWhen}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
