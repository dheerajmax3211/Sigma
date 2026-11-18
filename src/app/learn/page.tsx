import { LearnList, type Section } from "@/components/deck/LearnList";
import { deckIds, loadDeck } from "@/lib/decks/load";
import { trackRank, trackTitle } from "@/lib/decks/tracks";
import { deckPlacement } from "@/lib/decks/weeks";

export const dynamic = "force-dynamic";

export default function LearnIndex() {
  const where = deckPlacement();
  const decks = deckIds().map((id) => loadDeck(id)!).sort((a, b) => a.order - b.order);
  const sections: Section[] = [];
  for (const d of decks) {
    const { track, group: label } = where[d.id] ?? { track: "path", group: "Week 8" };
    let s = sections.find((x) => x.track === track);
    if (!s) sections.push((s = { track, title: trackTitle(track), groups: [] }));
    let g = s.groups.find((x) => x.label === label);
    if (!g) s.groups.push((g = { label, decks: [] }));
    g.decks.push({ id: d.id, title: d.title, cards: d.cards.length, minutes: d.minutes });
  }
  sections.sort((a, b) => trackRank(a.track) - trackRank(b.track));
  return <LearnList sections={sections} />;
}
