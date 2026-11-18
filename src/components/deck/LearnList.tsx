"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pathDay, readDone } from "@/lib/decks/progress";

export type Row = { id: string; title: string; cards: number; minutes: number };
export type Group = { label: string; decks: Row[] };
export type Section = { track: string; title: string; groups: Group[] };

export function LearnList({ sections }: { sections: Section[] }) {
  const [done, setDone] = useState<string[]>([]);
  const [day, setDay] = useState(1);
  useEffect(() => { setDone(readDone()); setDay(pathDay()); }, []);

  const all = sections.flatMap((s) => s.groups.flatMap((g) => g.decks));
  const next = all.find((d) => !done.includes(d.id));
  const left = all.filter((d) => !done.includes(d.id)).reduce((m, d) => m + d.minutes, 0);

  return (
    <div className="mx-auto max-w-[820px] px-5 py-10">
      <h1 className="text-3xl font-bold text-fg">Learn</h1>
      <p className="mt-2 text-ink-dim">Day {day} of 56 · {done.length} of {all.length} lessons done · about {Math.round(left / 60)} hours left</p>
      {next && (
        <Link href={`/learn/${next.id}`} className="mt-5 flex items-center justify-between rounded-2xl bg-brand px-5 py-4 font-semibold text-bg">
          <span>{done.length ? "Continue" : "Start"}: {next.title}</span>
          <span className="font-mono text-[12px]">{next.minutes} min →</span>
        </Link>
      )}
      {sections.map((s) => (
        <div key={s.track} className="mt-10">
          <h2 className="text-2xl font-bold text-fg">{s.title}</h2>
          {s.groups.map((g) => {
            const n = g.decks.filter((d) => done.includes(d.id)).length;
            return (
              <section key={g.label} className="mt-5">
                <h3 className="flex items-baseline justify-between text-lg font-semibold text-fg">
                  <span>{g.label}</span>
                  <span className="font-mono text-[12px] font-normal text-ink-dimmer">{n} / {g.decks.length}</span>
                </h3>
                <ol className="mt-3 space-y-2">
                  {g.decks.map((d) => {
                    const ok = done.includes(d.id);
                    return (
                      <li key={d.id}>
                        <Link href={`/learn/${d.id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface-1 p-4 hover:border-brand/50">
                          <span className={`grid h-8 w-8 place-items-center rounded-full font-mono text-sm ${ok ? "bg-brand text-bg" : "bg-brand/15 text-brand"}`}>{ok ? "✓" : ""}</span>
                          <span className="flex-1 text-base font-semibold text-fg">{d.title}</span>
                          <span className="font-mono text-[12px] text-ink-dimmer">{d.minutes} min</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}
