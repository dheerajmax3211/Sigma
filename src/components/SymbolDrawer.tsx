"use client";

import { useEffect, useMemo, useState } from "react";
import { symbolsByGroup, type SymbolEntry } from "@/lib/math/symbols";

type GroupFilter = "All" | "Greek" | "Operators" | "Notation";

const GROUP_FILTERS: GroupFilter[] = ["All", "Greek", "Operators", "Notation"];

function Chip({
  active = false,
  count,
  onClick,
  label,
}: {
  active?: boolean;
  count?: number;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-mono text-[10px] transition ${
        active
          ? "border-brand/60 bg-brand/15 text-brand"
          : "border-line bg-surface-2 text-ink-dim hover:border-line-2 hover:text-fg"
      }`}
    >
      {label}
      {typeof count === "number" && <span className="text-[9px] opacity-60">{count}</span>}
    </button>
  );
}

/**
 * The floating symbol dictionary.
 *
 * Bottom-left, so it never collides with the code/coach launchers on the right.
 * Keyboard: Escape closes it, Shift+M toggles it from anywhere. The glyphs are
 * live-rendered text, not images, so they match what appears in the formulas.
 *
 * `pageSymbols` is the list of glyphs used by the lesson currently on screen.
 * When supplied, the drawer offers an "on this page" filter so a learner can
 * see only the symbols they just met instead of all 47.
 */
export function SymbolDrawer({ pageSymbols }: { pageSymbols?: string[] }) {
  const [open, setOpen] = useState(false);
  // Search is not a nicety here: the list is 47 entries and the question is
  // usually "what is that squiggle?", which means the learner does not know the
  // name to look under. So the query matches glyph, name, pronunciation AND
  // meaning — you can find ‖ by typing "norm".
  const [query, setQuery] = useState("");
  // The layout mounts this drawer globally and cannot know which glyphs the
  // page below uses, so when no `pageSymbols` prop is supplied we read them off
  // the rendered tooltips on open.
  const [scanned, setScanned] = useState<string[]>([]);
  const [group, setGroup] = useState<GroupFilter>("All");
  const [onPage, setOnPage] = useState(false);

  const allGroups = useMemo(() => symbolsByGroup(), []);
  const total = useMemo(
    () => allGroups.reduce((n, g) => n + g.entries.length, 0),
    [allGroups],
  );
  const effectiveSymbols = pageSymbols && pageSymbols.length > 0 ? pageSymbols : scanned;
  const pageSet = useMemo(() => new Set(effectiveSymbols), [effectiveSymbols]);
  const hasPage = pageSet.size > 0;

  // The prop can disappear when the learner navigates to a page without
  // symbols; leaving the toggle on would then hide everything.
  useEffect(() => {
    if (!hasPage) setOnPage(false);
  }, [hasPage]);

  const q = query.trim().toLowerCase();
  const matches = (e: SymbolEntry) =>
    (!q ||
      e.char.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.say.toLowerCase().includes(q) ||
      e.meaning.toLowerCase().includes(q) ||
      e.tex.toLowerCase().includes(q)) &&
    (!onPage || pageSet.has(e.char));

  const counts: Record<GroupFilter, number> = {
    All: 0,
    Greek: 0,
    Operators: 0,
    Notation: 0,
  };
  for (const g of allGroups) {
    for (const e of g.entries) {
      if (!matches(e)) continue;
      counts.All += 1;
      counts[g.group as Exclude<GroupFilter, "All">] += 1;
    }
  }

  const groups = allGroups
    .filter((g) => group === "All" || g.group === group)
    .map((g) => ({ ...g, entries: g.entries.filter(matches) }))
    .filter((g) => g.entries.length > 0);

  const hits = groups.reduce((n, g) => n + g.entries.length, 0);
  const narrowed = Boolean(q) || group !== "All" || onPage;

  const clearFilters = () => {
    setQuery("");
    setGroup("All");
    setOnPage(false);
  };

  useEffect(() => {
    if (!open) return;
    if (pageSymbols && pageSymbols.length > 0) return;
    const glyphs = new Set<string>();
    document.querySelectorAll(".sym-tip").forEach((el) => {
      const g = (el.textContent ?? "").trim();
      if (g) glyphs.add(g);
    });
    setScanned([...glyphs]);
  }, [open, pageSymbols]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Shift+M opens the dictionary from anywhere. It is skipped while the learner
  // is typing, because "M" is a letter people need — hijacking it inside the
  // answer box or the code editor would cost more than the shortcut is worth.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "M" && e.key !== "m") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Symbol dictionary — how to say every symbol (Shift+M)"
        className="fixed bottom-5 left-5 z-40 grid h-11 w-11 place-items-center rounded-full border border-brand/40 bg-surface-2 text-[17px] text-brand shadow-lg transition hover:bg-surface-3"
        aria-label="Open the symbol dictionary"
      >
        Σ
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/55"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="fixed bottom-0 left-0 top-0 z-50 flex w-[min(420px,94vw)] flex-col border-r border-line bg-surface-1 shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/15 font-mono text-[13px] font-bold text-brand ring-1 ring-brand/30">
                Σ
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-semibold text-fg">Say it out loud</h2>
                <p className="font-mono text-[10.5px] text-ink-dimmer">
                  {total} symbols · name, pronunciation, meaning
                </p>
                <p className="font-mono text-[10px] text-ink-dimmer/80">
                  Shift+M toggles this anywhere
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-2 py-1 font-mono text-[10.5px] text-ink-dim hover:text-fg"
              >
                esc
              </button>
            </div>

            <div className="border-b border-line px-4 py-2.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a symbol, a name, or “how do I say this”"
                aria-label="Search symbols"
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-fg outline-none placeholder:text-ink-dimmer focus:border-line-2"
              />
              {narrowed && (
                <p className="mt-1.5 font-mono text-[10px] text-ink-dimmer">
                  {hits} of {total} symbols
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
              {GROUP_FILTERS.map((g) => (
                <Chip
                  key={g}
                  label={g}
                  active={group === g}
                  count={g === "All" ? undefined : counts[g]}
                  onClick={() => setGroup(g)}
                />
              ))}
              {hasPage && (
                <Chip
                  label="on this page"
                  active={onPage}
                  count={pageSet.size}
                  onClick={() => setOnPage((v) => !v)}
                />
              )}
              {narrowed && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-auto font-mono text-[10px] text-ink-dimmer underline decoration-dotted underline-offset-2 hover:text-fg"
                >
                  clear
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {narrowed && hits === 0 && (
                <p className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-[12px] text-ink-dim">
                  Nothing matches {q ? `“${q}”` : "these filters"}
                  {group !== "All" ? ` in ${group}` : ""}. Try a name (norm, transpose) or a
                  description (sum, square root).
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-2 text-brand underline decoration-dotted underline-offset-2 hover:text-fg"
                  >
                    reset
                  </button>
                </p>
              )}
              {groups.map((g) => (
                <section key={g.group} className="mb-5">
                  <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
                    {g.group}
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {g.entries.map((s) => (
                      <div
                        key={s.tex}
                        className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2"
                      >
                        <span className="mt-[1px] w-7 shrink-0 text-center font-serif text-[19px] leading-tight text-brand">
                          {s.char}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-semibold text-fg">
                            {s.name}
                            <span className="ml-2 font-normal text-ink-dim">“{s.say}”</span>
                          </div>
                          <div className="text-[11.5px] leading-relaxed text-ink-dimmer">
                            {s.meaning}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
