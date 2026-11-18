import { getContent } from "@/lib/content/loader";

export const dynamic = "force-dynamic";

/**
 * The chronology.
 *
 * A "news feed" is only as good as its sourcing, and this app has no network
 * access by design. So instead of inventing a feed, this page derives one from
 * what the corpus already asserts: every case study and blueprint carries a
 * dated `timeline`, and those entries are real, attributed claims already
 * reviewed as content.
 *
 * The result answers the question an interviewer actually asks — "what happened,
 * in what order, and what changed because of it" — without a single undated or
 * unsourced bullet.
 */

/** Best-effort parse of "16 Jul 2026", "Jul 2026", "2026-07-16", "2026". */
function parseWhen(when: string): number {
  const s = when.trim();
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];

  const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] ?? 1));
  }

  const dmy = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (dmy) {
    const m = months.indexOf(dmy[2].slice(0, 3).toLowerCase());
    if (m >= 0) return Date.UTC(Number(dmy[3]), m, Number(dmy[1]));
  }

  const my = s.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (my) {
    const m = months.indexOf(my[1].slice(0, 3).toLowerCase());
    if (m >= 0) return Date.UTC(Number(my[2]), m, 1);
  }

  const y = s.match(/^(\d{4})$/);
  if (y) return Date.UTC(Number(y[1]), 0, 1);

  return 0;
}

export default async function NewsPage() {
  const content = getContent();

  const events = content.notes.flatMap((note) =>
    note.timeline.map((t) => ({
      when: t.what ? t.when : t.when,
      what: t.what,
      noteId: note.id,
      noteTitle: note.title,
      actors: note.actors,
      ts: parseWhen(t.when),
    })),
  );

  // Newest first; anything with an unparseable date sinks to the bottom rather
  // than pretending to be current.
  events.sort((a, b) => b.ts - a.ts || a.when.localeCompare(b.when));

  // Group by year so the page reads as history rather than a pile.
  const byYear = new Map<string, typeof events>();
  for (const e of events) {
    const year = e.ts ? new Date(e.ts).getUTCFullYear().toString() : "Undated";
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(e);
  }

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">AI timeline</p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">
        What shipped, and when
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
        {events.length} dated events drawn from {content.notes.length} case studies and blueprints.
        Every entry is attributed to the document that makes the claim — there is no unattributed
        news here.
      </p>

      <div className="mt-8 flex flex-col gap-10">
        {[...byYear.entries()].map(([year, items]) => (
          <section key={year}>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dimmer">
              {year}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-line">
              {items.map((e, i) => (
                <div
                  key={`${e.noteId}-${i}`}
                  className={`bg-surface-1 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-brand">
                      {e.when}
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-fg">
                      {e.what}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <span className="w-24 shrink-0" />
                    <a
                      href={`/note/${e.noteId}`}
                      className="inline-flex min-h-9 items-center py-1 font-mono text-[10.5px] text-ink-dimmer transition hover:text-brand"
                    >
                      {e.noteTitle} →
                    </a>
                    {e.actors.length > 0 && (
                      <span className="font-mono text-[10px] text-ink-dimmer">
                        {e.actors.slice(0, 3).join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {events.length === 0 && (
        <p className="mt-8 rounded-xl border border-line bg-surface-1 p-4 text-[13px] text-ink-dim">
          No dated events yet. Case studies contribute their `timeline` entries here.
        </p>
      )}
    </div>
  );
}
