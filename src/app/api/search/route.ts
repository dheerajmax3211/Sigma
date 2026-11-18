import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Full-text search over the curriculum.
 *
 * `topic_fts` has been populated on every seed since the first migration and
 * nothing ever queried it. This is the reader.
 *
 * The query is passed to FTS5 as a MATCH expression, so a malformed one throws
 * rather than returning nothing — that difference matters, because "no results"
 * and "invalid query" are different things to a learner. Malformed input falls
 * back to a quoted phrase search.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);

  if (raw.length === 0) {
    return NextResponse.json({ query: raw, results: [], total: 0 });
  }
  if (raw.length > 200) {
    return NextResponse.json({ error: "query too long" }, { status: 400 });
  }

  const db = getDb();

  // A bare quote-wrapped phrase is the safest form that still supports
  // multiple tokens; fall back to it if the user typed something FTS rejects.
  const attempts = [raw, `"${raw.replace(/"/g, '""')}"`];

  for (const expr of attempts) {
    try {
      const rows = db
        .prepare(
          `SELECT topic_fts.topic_id AS topic_id,
                  t.title,
                  t.summary,
                  t.track_id,
                  t.kind,
                  t.difficulty,
                  snippet(topic_fts, 3, '<mark>', '</mark>', '…', 24) AS snippet,
                  bm25(topic_fts, 0.0, 4.0, 2.0, 1.0) AS score
             FROM topic_fts
             JOIN topic t ON t.id = topic_fts.topic_id
            WHERE topic_fts MATCH ?
            ORDER BY score
            LIMIT ?`,
        )
        .all(expr, limit) as {
        topic_id: string;
        title: string;
        summary: string;
        track_id: string | null;
        kind: string | null;
        difficulty: string | null;
        snippet: string;
        score: number;
      }[];

      return NextResponse.json({
        query: raw,
        // bm25 returns lower-is-better; the client only needs the ordering,
        // but exposing a normalised relevance makes the UI honest about it.
        results: rows.map((r, i) => ({ ...r, rank: i + 1 })),
        total: rows.length,
      });
    } catch {
      // Try the next strategy.
    }
  }

  return NextResponse.json({ query: raw, results: [], total: 0, note: "no parseable query" });
}
