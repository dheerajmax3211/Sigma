import { deckIds, loadDeck } from "../src/lib/decks/load";
import { checkDeck } from "../src/lib/decks/validate";

let bad = 0;
const ids = new Set(deckIds());
for (const id of ids) {
  try {
    const deck = loadDeck(id)!;
    const errs = checkDeck(deck);
    for (const c of deck.cards) {
      const href = c.kind === "mistakes" ? c.next?.href : undefined;
      if (href?.startsWith("/learn/") && !ids.has(href.slice(7))) errs.push(`[${id}] next link ${href} points to no deck`);
    }
    if (errs.length) { bad += errs.length; console.error(errs.join("\n")); } else console.log(`ok  ${id}`);
  } catch (e) { bad++; console.error(`[${id}] schema: ${e}`); }
}
process.exit(bad ? 1 : 0);
