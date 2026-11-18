"use client";

import { useEffect, useMemo, useState } from "react";
import { markDone } from "@/lib/decks/progress";
import Link from "next/link";
import { evaluate, type Scope } from "@/lib/decks/expr";
import { fill, fmt, inline, tex } from "@/lib/decks/text";
import type { Card, Deck } from "@/lib/decks/schema";
import { Chain } from "./Chain";
import { View } from "./Views";
import { ProblemRunner } from "@/components/ProblemRunner";

const Html = ({ s, scope, as: As = "span" }: { s: string; scope: Scope; as?: "span" | "p" }) => (
  <As dangerouslySetInnerHTML={{ __html: inline(fill(s, scope)) }} />
);

function Slider({ label, v, set, min, max, step }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step: number }) {
  return (
    <label className="flex items-center gap-3 font-mono text-[13px] text-ink-dim">
      <span className="w-12 text-fg">{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} className="h-1 flex-1 accent-[#1cd6ac]" />
      <span className="w-12 text-right text-brand">{fmt(v)}</span>
    </label>
  );
}

const Shell = ({ card, children }: { card: Card; children: React.ReactNode }) => (
  <section className="animate-rise rounded-3xl border border-brand/20 bg-gradient-to-br from-surface-2 via-surface-1 to-surface-1 p-6 shadow-[0_0_60px_-20px_rgba(28,214,172,0.35)] md:p-10">
    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">{card.kicker}</p>
    <h2 className="mt-1 text-3xl font-bold tracking-tight text-fg">{card.title}</h2>
    <div className="mt-5 space-y-4 text-[17px] leading-[1.8] text-ink-dim [&_b]:text-fg">{children}</div>
  </section>
);

const Btn = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">{children}</button>
);
const Ghost = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="rounded-lg border border-line-2 px-4 py-2 text-sm">{children}</button>
);

export function DeckPlayer({ deck }: { deck: Deck }) {
  const init = useMemo(() => Object.fromEntries(deck.params.map((p) => [p.id, p.init])), [deck]);
  const [vals, setVals] = useState<Record<string, number>>(init);
  const [i, setI] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState<number | null>(null);

  const scope = useMemo(() => {
    const s: Scope = { ...vals };
    for (const d of deck.derived) s[d.id] = evaluate(d.expr, s);
    return s;
  }, [vals, deck]);
  const param = (id: string) => deck.params.find((p) => p.id === id)!;
  const go = (n: number) => { setI(n); setStep(0); setPick(null); };

  const render = (c: Card) => {
    switch (c.kind) {
      case "story":
        return (
          <Shell card={c}>
            {c.body.map((b, k) => <Html key={k} as="p" s={b} scope={scope} />)}
            {c.callout && <p className="rounded-lg border border-line bg-surface-2 p-4 text-fg"><Html s={c.callout} scope={scope} /></p>}
          </Shell>
        );
      case "lab": {
        const a = c.action;
        return (
          <Shell card={c}>
            <Html as="p" s={c.intro} scope={scope} />
            <View view={c.view} scope={scope} blame={c.showBlame ? "all" : "none"} />
            {c.also && <View view={c.also} scope={scope} />}
            {c.says.length > 0 && c.saysAt && <p key={Math.round(evaluate(c.saysAt, scope))} className="animate-rise rounded-lg border border-line bg-surface-2 p-3 text-[15px] text-fg"><Html s={c.says[Math.min(c.says.length - 1, Math.max(0, Math.round(evaluate(c.saysAt, scope))))]} scope={scope} /></p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {c.sliders.map((id) => { const p = param(id); return <Slider key={id} label={p.label} v={vals[id]} min={p.min} max={p.max} step={p.step} set={(n) => setVals((v) => ({ ...v, [id]: n }))} />; })}
            </div>
            {a && (
              <>
                <div className="flex items-center gap-3">
                  <Btn onClick={() => {
                    const sc = { ...scope, rate: a.rate ? scope[a.rate] : 0.02 };
                    const next = { ...vals };
                    for (const [k, e] of Object.entries(a.set)) next[k] = evaluate(e, sc);
                    setHistory((h) => [...(h.length ? h : [scope[a.track]]), (() => { const s2: Scope = { ...next }; for (const d of deck.derived) s2[d.id] = evaluate(d.expr, s2); return s2[a.track]; })()]);
                    setVals(next);
                  }}>{a.label}</Btn>
                  <Ghost onClick={() => { setVals(init); setHistory([]); }}>Reset</Ghost>
                  <span className="font-mono text-sm text-brand">{a.track} {fmt(scope[a.track])}</span>
                </div>
                {history.length > 1 && (() => { const mx = Math.max(...history, 1e-9); return (
                  <svg viewBox="0 0 200 50" className="h-16 w-full" aria-label={`${a.track} over steps`}>
                    <polyline fill="none" stroke="#f97316" strokeWidth={2} points={history.map((v, k) => `${(k / (history.length - 1)) * 196 + 2},${46 - (Math.min(v, mx) / mx) * 42}`).join(" ")} />
                  </svg>); })()}
                {a.hint && <p className="text-[14px]"><Html s={a.hint} scope={scope} /></p>}
              </>
            )}
            {c.outro && <Html as="p" s={c.outro} scope={scope} />}
          </Shell>
        );
      }
      case "formula":
        return (
          <Shell card={c}>
            <p className="text-center text-xl text-fg" dangerouslySetInnerHTML={{ __html: tex(c.tex, true) }} />
            <p><i><Html s={c.say} scope={scope} /></i></p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface-2">
              {c.symbols.map((y, k) => (
                <li key={k} className="flex items-center gap-4 px-4 py-2.5">
                  <span className="w-14 text-lg text-fg" dangerouslySetInnerHTML={{ __html: tex(y.tex) }} />
                  <span className="flex-1 text-[15px]"><Html s={y.means} scope={scope} /></span>
                  {y.value && <span className="font-mono text-brand">{fmt(evaluate(y.value, scope))}</span>}
                </li>
              ))}
            </ul>
          </Shell>
        );
      case "reveal":
        return (
          <Shell card={c}>
            <Html as="p" s={c.intro} scope={scope} />
            <Chain view={c.view} scope={scope} blame={step} />
            <ol className="space-y-2">
              {c.steps.slice(0, step + 1).map((s, k) => (
                <li key={k} className="animate-rise rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center gap-3"><span className="text-fg" dangerouslySetInnerHTML={{ __html: tex(s.tex) }} /><span className="font-mono text-sm text-brand-orange"><Html s={s.value} scope={scope} /></span></div>
                  <div className="text-[14px]"><Html s={s.says} scope={scope} /></div>
                </li>
              ))}
            </ol>
            <div className="flex gap-2">
              <Btn disabled={step >= c.steps.length - 1} onClick={() => setStep((s) => s + 1)}>Next blame</Btn>
              <Ghost onClick={() => setStep(0)}>Restart</Ghost>
            </div>
            {c.outro && <p className="text-[14px]"><Html s={c.outro} scope={scope} /></p>}
          </Shell>
        );
      case "check":
        return (
          <Shell card={c}>
            <Html as="p" s={c.question} scope={scope} />
            {c.options.map((o, k) => (
              <button key={k} onClick={() => setPick(k)} className={`block w-full rounded-xl border p-3 text-left text-[15px] ${pick === k ? (o.correct ? "border-brand bg-brand/10" : "border-brand-pink bg-brand-pink/10") : "border-line bg-surface-2"}`}><Html s={o.text} scope={scope} /></button>
            ))}
            {pick !== null && <p className="animate-rise"><Html s={(c.options[pick].correct ? "" : "Not quite. ") + c.options[pick].why} scope={scope} /></p>}
          </Shell>
        );
      case "code":
        return (
          <Shell card={c}>
            <Html as="p" s={c.intro} scope={scope} />
            <pre className="overflow-x-auto rounded-xl border border-line bg-surface-2 p-4 font-mono text-[13px] leading-relaxed text-fg"><code>{c.code}</code></pre>
            {c.note && <p className="text-[14px]"><Html s={c.note} scope={scope} /></p>}
          </Shell>
        );
      case "practice":
        return (
          <Shell card={c}>
            <Html as="p" s={c.intro} scope={scope} />
            <ProblemRunner key={`${deck.id}-${i}`} problemId={`${deck.id}-${i}`} starter={c.starter} entry={c.entry} testCases={c.tests.map((t) => ({ ...t, mode: "json" }))} />
            {c.hint && <details className="text-[14px]"><summary className="cursor-pointer text-brand">Stuck? Show a hint</summary><p className="mt-2"><Html s={c.hint} scope={scope} /></p></details>}
            <details className="text-[14px]"><summary className="cursor-pointer text-brand">Give up? Show the solution</summary><pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface-2 p-4 font-mono text-[13px] leading-relaxed text-fg"><code>{c.solution}</code></pre></details>
          </Shell>
        );
      case "mistakes":
        return (
          <Shell card={c}>
            {c.items.map((t, k) => <Html key={k} as="p" s={t} scope={scope} />)}
            {c.next && <Link href={c.next.href} className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-bg">{c.next.label}</Link>}
          </Shell>
        );
    }
  };

  const total = deck.cards.length;
  useEffect(() => { if (i === total - 1) markDone(deck.id); }, [i, total, deck.id]);
  return (
    <div className="mx-auto max-w-[820px] px-5 py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">{deck.title} · {total} cards · about {deck.minutes} minutes</p>
      <div className="mt-3 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={i + 1}>
        {deck.cards.map((_, k) => <button key={k} onClick={() => go(k)} aria-label={`Go to card ${k + 1}`} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-brand" : "bg-surface-4"}`} />)}
      </div>
      <div className="mt-5" key={i}>{render(deck.cards[i])}</div>
      <div className="mt-5 flex justify-between">
        <button onClick={() => go(Math.max(0, i - 1))} disabled={i === 0} className="rounded-lg border border-line-2 px-5 py-2.5 text-sm disabled:opacity-30">Back</button>
        <button onClick={() => go(Math.min(total - 1, i + 1))} disabled={i === total - 1} className="rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-30">Next</button>
      </div>
    </div>
  );
}
