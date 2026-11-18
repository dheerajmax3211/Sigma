"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Onboarding that produces an *ordering*, not a personality profile.
 *
 * Three answers, all of which change what you should do next week:
 *   - where you are starting from (decides the entry track)
 *   - what role you are aiming at (decides which track is pulled forward)
 *   - how many weeks you have (decides hours per week, and what gets deferred)
 *
 * The result is stored locally and never leaves the machine.
 */

const ENTRY = [
  { id: "zero", label: "From zero", detail: "No maths beyond school, no Python yet.", start: "foundations" },
  { id: "some", label: "Some code", detail: "Comfortable with Python; maths is rusty.", start: "core-ml" },
  { id: "ml", label: "Some ML", detail: "Trained models; gaps are in the maths and systems.", start: "deep-learning" },
] as const;

const ROLE = [
  { id: "applied", label: "Applied MLE", pull: "transformers", note: "Model quality and evaluation." },
  { id: "infra", label: "ML / Inference Infra", pull: "distributed", note: "Serving, training clusters, cost." },
  { id: "genai", label: "Generative AI", pull: "audio", note: "Text, audio, video, agents." },
  { id: "research", label: "Research Engineer", pull: "deep-learning", note: "Derivations and from-scratch work." },
] as const;

const WEEKS = [4, 8, 12, 24] as const;

type Plan = { entry: string; role: string; weeks: number; createdAt: string };

const KEY = "sigma.plan";

export default function StartPage() {
  const [entry, setEntry] = useState<string>("zero");
  const [role, setRole] = useState<string>("applied");
  const [weeks, setWeeks] = useState<number>(12);
  const [saved, setSaved] = useState<Plan | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSaved(JSON.parse(raw) as Plan);
    } catch {
      /* corrupt plan is not worth failing the page over */
    }
  }, []);

  const plan = useMemo(() => {
    const entryTrack = ENTRY.find((e) => e.id === entry)?.start ?? "foundations";
    const pull = ROLE.find((r) => r.id === role)?.pull ?? "transformers";

    // Track order: the entry track first, then everything in curriculum order
    // with the role's priority track pulled directly behind it. Deferring is
    // explicit — with few weeks, the build track and audio come last.
    const order = [
      entryTrack,
      pull,
      "foundations",
      "core-ml",
      "deep-learning",
      "transformers",
      "vision",
      "distributed",
      "staff",
      "build",
      "audio",
    ].filter((v, i, a) => a.indexOf(v) === i);

    const hoursPerWeek = Math.round((weeks <= 4 ? 20 : weeks <= 8 ? 14 : weeks <= 12 ? 10 : 6) * 10) / 10;
    return { entryTrack, pull, order, hoursPerWeek };
  }, [entry, role, weeks]);

  const save = () => {
    const p: Plan = { entry, role, weeks, createdAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* private mode — the plan still renders, it just will not persist */
    }
    setSaved(p);
  };

  return (
    <div className="mx-auto max-w-[820px] px-5 py-10">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Setup</p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">Where are you starting?</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
        Three questions. They decide which track you open first and how much you are committing to
        per week — nothing else.
      </p>

      <Block title="1 · Your starting point">
        <div className="grid gap-2 sm:grid-cols-3">
          {ENTRY.map((e) => (
            <Choice key={e.id} active={entry === e.id} onClick={() => setEntry(e.id)} title={e.label} detail={e.detail} />
          ))}
        </div>
      </Block>

      <Block title="2 · What you are aiming at">
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLE.map((r) => (
            <Choice key={r.id} active={role === r.id} onClick={() => setRole(r.id)} title={r.label} detail={r.note} />
          ))}
        </div>
      </Block>

      <Block title="3 · Time you can actually give it">
        <div className="flex flex-wrap gap-2">
          {WEEKS.map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={`rounded-lg border px-4 py-2 font-mono text-[12.5px] transition ${
                weeks === w
                  ? "border-brand/50 bg-brand/10 text-brand"
                  : "border-line bg-surface-1 text-ink-dim hover:border-line-2"
              }`}
            >
              {w} weeks
            </button>
          ))}
        </div>
      </Block>

      <div className="mt-8 rounded-2xl border border-line bg-surface-1 p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Your path</div>
        <div className="mt-2 text-[15px] font-semibold text-fg">
          Start in <span className="text-brand">{plan.entryTrack}</span>, then {plan.pull} — about{" "}
          {plan.hoursPerWeek} h/week for {weeks} weeks.
        </div>
        <ol className="mt-3 flex flex-wrap gap-1.5">
          {plan.order.map((t, i) => (
            <li
              key={t}
              className={`rounded-md border px-2 py-1 font-mono text-[10.5px] ${
                i === 0
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : i === 1
                    ? "border-brand-orange/40 bg-brand-orange/10 text-brand-orange"
                    : "border-line bg-surface-2 text-ink-dimmer"
              }`}
            >
              {i + 1}. {t}
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-3">
          <a
            href={`/track/${plan.entryTrack}`}
            className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-[#04140f] transition hover:bg-brand/90"
          >
            Open {plan.entryTrack} →
          </a>
          <button
            onClick={save}
            className="rounded-lg border border-line px-4 py-2 text-[13px] text-ink-dim transition hover:border-line-2 hover:text-fg"
          >
            Save this path
          </button>
          {saved && (
            <span className="font-mono text-[11px] text-brand">saved locally</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">{title}</h2>
      {children}
    </section>
  );
}

function Choice({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-brand/50 bg-brand/[0.07]"
          : "border-line bg-surface-1 hover:border-line-2"
      }`}
    >
      <div className={`text-[13.5px] font-semibold ${active ? "text-brand" : "text-fg"}`}>{title}</div>
      <div className="mt-1 text-[12px] leading-relaxed text-ink-dim">{detail}</div>
    </button>
  );
}
