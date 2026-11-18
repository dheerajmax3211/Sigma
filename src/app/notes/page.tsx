import Link from "next/link";
import { getContent } from "@/lib/content/loader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Field Notes — Sigma" };

export default async function NotesIndex() {
  const content = getContent();
  const cases = content.notes.filter((n) => n.kind === "case_study");
  const playbooks = content.notes.filter((n) => n.kind === "playbook");

  const Section = ({
    title,
    blurb,
    items,
  }: {
    title: string;
    blurb: string;
    items: typeof content.notes;
  }) => (
    <section className="mt-8">
      <h2 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-brand">{title}</h2>
      <p className="mt-1 text-[13px] text-ink-dimmer">{blurb}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((n) => (
          <Link
            key={n.id}
            href={`/note/${n.id}`}
            className="rounded-xl border border-line bg-surface-1 px-4 py-3 transition hover:border-line-2 hover:bg-surface-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13.5px] font-medium text-fg">{n.title}</p>
              {n.date && (
                <span className="shrink-0 font-mono text-[10px] text-ink-dimmer">{n.date.slice(0, 7)}</span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-dim">{n.summary}</p>
          </Link>
        ))}
        {items.length === 0 && (
          <p className="font-mono text-[12px] text-ink-dimmer">Being written.</p>
        )}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Case studies</p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">
        How it was actually built
      </h1>
      <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-dim">
        Short, dated, and specific: real systems, real decisions, real costs — plus the
        playbooks for building your own. Five minutes each, not forty.
      </p>

      <Section
        title="Case studies"
        blurb="What happened, in what order, and what each choice cost."
        items={cases}
      />
      <Section
        title="Playbooks"
        blurb="Step-by-step procedures you can run today."
        items={playbooks}
      />
    </div>
  );
}
