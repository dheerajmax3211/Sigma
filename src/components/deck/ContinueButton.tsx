"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pathDay, readDone } from "@/lib/decks/progress";

export type Lesson = { id: string; title: string; minutes: number };

/** Big call to action: the first lesson not yet finished, plus the day counter. */
export function ContinueButton({ lessons }: { lessons: Lesson[] }) {
  const [done, setDone] = useState<string[]>([]);
  const [day, setDay] = useState(1);
  useEffect(() => { setDone(readDone()); setDay(pathDay()); }, []);
  const next = lessons.find((l) => !done.includes(l.id));
  return (
    <div>
      <p className="font-mono text-[12px] text-ink-dimmer">Day {day} of 56 · {done.length} of {lessons.length} lessons done</p>
      <Link href={next ? `/learn/${next.id}` : "/learn"} className="mt-3 inline-flex items-center gap-3 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-bg hover:brightness-110">
        {next ? `${done.length ? "Continue" : "Start"}: ${next.title}` : "All lessons done"}
        {next && <span className="font-mono text-[12px]">{next.minutes} min →</span>}
      </Link>
    </div>
  );
}
