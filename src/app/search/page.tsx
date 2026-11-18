import { SearchConsole, type TrackRef } from "@/components/SearchConsole";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Curriculum search.
 *
 * The `topic_fts` index has been built on every seed since the first migration;
 * this is the page that finally queries it.
 *
 * The track list is read server-side only so the empty state can offer real
 * places to browse instead of guessing at names.
 */
export default function SearchPage() {
  const tracks = getDb()
    .prepare(`SELECT id, title FROM track ORDER BY sort_order, title`)
    .all() as TrackRef[];

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-violet">
        Search
      </p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">Find a topic</h1>
      <p className="mb-7 mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
        Full-text search across every lesson&apos;s title, summary and body,
        ranked by BM25 with titles weighted above body text. Matches are
        highlighted in context; filter by track and level once results arrive.
      </p>
      <SearchConsole tracks={tracks} />
    </div>
  );
}
