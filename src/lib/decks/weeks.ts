import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONTENT_ROOT } from "@/lib/content/loader";

export type Placement = { track: string; week: number; group: string };

/** deck id -> track, week and group label (`group` defaults to "Week N"), read from content/outline.yaml. `track` defaults to "path". */
export function deckPlacement(): Record<string, Placement> {
  const rows = YAML.parse(fs.readFileSync(path.join(CONTENT_ROOT, "outline.yaml"), "utf8")) as { id: string; week?: number; track?: string; group?: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, { track: r.track ?? "path", week: r.week ?? 0, group: r.group ?? (r.week ? `Week ${r.week}` : "") }]));
}
