import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONTENT_ROOT } from "@/lib/content/loader";
import { Deck } from "./schema";

const DIR = path.join(CONTENT_ROOT, "decks");

/** Returns null when no such deck exists. Throws (loudly) when the file is invalid. */
export function loadDeck(id: string): Deck | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const file = path.join(DIR, `${id}.yaml`);
  if (!fs.existsSync(file)) return null;
  return Deck.parse(YAML.parse(fs.readFileSync(file, "utf8")));
}

export const deckIds = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".yaml")).map((f) => f.slice(0, -5)).sort() : []);
