"use client";

import { Markdown } from "@/components/CodeEditor";

/** Worked derivations, one per mathematical step. */
export function DerivationView({
  derivations,
}: {
  derivations: { title: string; latex?: string; prose?: string }[];
}) {
  if (derivations.length === 0) {
    return (
      <p className="py-8 text-center font-mono text-[12px] text-ink-dimmer">
        No derivation for this topic yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {derivations.map((d, i) => (
        <section key={i}>
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-3 font-mono text-[11px] font-bold text-brand">
              {i + 1}
            </span>
            <h3 className="text-[15.5px] font-semibold tracking-tight text-fg">{d.title}</h3>
          </div>
          {d.prose && (
            <p className="mb-3 text-[14px] leading-relaxed text-ink-dim">
              <Markdown source={d.prose} />
            </p>
          )}
          {d.latex && (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface-2 px-5 py-4">
              <Markdown source={d.latex} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
