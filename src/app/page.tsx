import Link from "next/link";
import { ContinueButton } from "@/components/deck/ContinueButton";
import { deckIds, loadDeck } from "@/lib/decks/load";
import { TRACKS, trackRank } from "@/lib/decks/tracks";
import { deckPlacement } from "@/lib/decks/weeks";

export const dynamic = "force-dynamic";

export default function Home() {
  const where = deckPlacement();
  const decks = deckIds().map((id) => loadDeck(id)!).sort((a, b) => a.order - b.order);
  const track = (id: string) => where[id]?.track ?? "path";
  const lessons = decks
    .filter((d) => track(d.id) === "path")
    .map((d) => ({ id: d.id, title: d.title, minutes: d.minutes }));
  const counts = (t: string) => decks.filter((d) => track(d.id) === t).length;
  const shown = [...TRACKS].sort((a, b) => trackRank(a.id) - trackRank(b.id));

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">From zero to AI engineer</p>
      <h1 className="mt-3 max-w-3xl text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.025em] text-fg">
        Short lessons. Real animations. Every symbol explained.
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
        No walls of text. Each lesson is a few cards you click through, with sliders to play with and a quiz to check you got it.
      </p>
      <div className="mt-8"><ContinueButton lessons={lessons} /></div>

      <h2 className="mt-14 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">Tracks</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {shown.map((t) => (
          <Link key={t.id} href="/learn" className="rounded-2xl border border-line bg-surface-1 p-5 transition hover:border-brand/40">
            <div className="text-[16px] font-semibold text-fg">{t.title}</div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-dim">{t.blurb}</p>
            <p className="mt-3 font-mono text-[11px] text-brand">{counts(t.id) ? `${counts(t.id)} lessons` : "coming soon"}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-4 font-mono text-[12px] text-brand">
        <Link href="/curriculum">Deep dives: the full reference curriculum →</Link>
        <Link href="/interview">Mock interview →</Link>
        <Link href="/lab">Code playground →</Link>
      </div>
    </div>
  );
}
