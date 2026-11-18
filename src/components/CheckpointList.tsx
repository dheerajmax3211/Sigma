"use client";

import { useState } from "react";
import { InlineMath } from "@/components/CodeEditor";

/**
 * Self-check questions.
 *
 * The answer is revealed only on request. The hint is a separate, smaller
 * reveal than the solution — the ladder principle applies to self-assessment
 * too.
 */
export function CheckpointList({
  checkpoints,
}: {
  checkpoints: { id: string; question: string; solution?: string; hint?: string }[];
}) {
  const [revealed, setRevealed] = useState<Record<string, "hint" | "solution">>({});

  if (checkpoints.length === 0) {
    return (
      <p className="py-8 text-center font-mono text-[12px] text-ink-dimmer">
        No self-check questions for this topic yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {checkpoints.map((c, i) => {
        const state = revealed[c.id];
        return (
          <div
            key={c.id}
            className="rounded-xl border border-line bg-surface-2 p-4 transition hover:border-line-2"
          >
            <div className="mb-2 flex items-start gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded font-mono text-[10px] font-bold text-brand">
                Q{i + 1}
              </span>
              <p className="text-[14px] leading-relaxed text-fg">
                <InlineMath source={c.question} />
              </p>
            </div>

            <div className="ml-8 flex flex-wrap gap-2">
              {!state && c.hint && (
                <button
                  onClick={() => setRevealed((p) => ({ ...p, [c.id]: "hint" }))}
                  className="rounded-lg border border-line-2 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim transition hover:bg-surface-3 hover:text-fg"
                >
                  hint
                </button>
              )}
              {!state && (
                <button
                  onClick={() => setRevealed((p) => ({ ...p, [c.id]: "solution" }))}
                  className="rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-brand transition hover:bg-brand/15"
                >
                  reveal answer
                </button>
              )}
              {state && (
                <button
                  onClick={() =>
                    setRevealed((p) => {
                      const next = { ...p };
                      delete next[c.id];
                      return next;
                    })
                  }
                  className="rounded-lg border border-line px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dimmer transition hover:text-ink-dim"
                >
                  hide
                </button>
              )}
            </div>

            {state === "hint" && c.hint && (
              <p className="mt-3 animate-rise rounded-lg border border-brand-orange/25 bg-brand-orange/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-brand-orange">
                <InlineMath source={c.hint} />
              </p>
            )}
            {state === "solution" && c.solution && (
              <p className="mt-3 animate-rise rounded-lg border border-brand/25 bg-brand/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-fg">
                <InlineMath source={c.solution} />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
