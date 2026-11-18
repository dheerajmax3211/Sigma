/**
 * POST /api/progress/reset — delete everything this learner has stored.
 *
 * Local-first means the learner owns the record, and ownership includes the
 * right to erase it. This route clears exactly the tables the export route
 * writes (so "export, then delete" is a lossless round trip) and nothing else:
 * the `learner` row survives, because it is identity and settings, not
 * progress, and deleting it would silently change the id the UI is keyed on.
 *
 * The `DELETE` confirmation is enforced here as well as in the UI. A destructive
 * endpoint that trusts the client to have shown a confirm dialog is not a
 * confirmation — it is a suggestion.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ensureLearner } from "@/lib/progress/mastery";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  confirm: z.literal("DELETE"),
});

export async function POST(req: Request) {
  try {
    BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "confirmation required",
        detail: `send { "confirm": "DELETE" } — ${(err as Error).message}`,
      },
      { status: 400 },
    );
  }

  const db = getDb();
  const learnerId = ensureLearner(db);

  // Same scopes as the export route. `execution` has no learner column, so a
  // run is the learner's when it belongs to one of their coach sessions or to
  // no session at all (single-learner local database).
  const executionScope = `(session_id IS NULL OR session_id IN
      (SELECT id FROM coach_session WHERE learner_id = ?))`;
  const analysisScope = `(execution_id IN
      (SELECT id FROM execution WHERE session_id IS NULL OR session_id IN
        (SELECT id FROM coach_session WHERE learner_id = ?)))`;

  const removed = db.transaction((): Record<string, number> => {
    const counts: Record<string, number> = {};
    const del = (table: string, sql: string, ...params: unknown[]): void => {
      counts[table] = db.prepare(sql).run(...params).changes;
    };

    // Children before parents so explicit deletes never rely on cascade order.
    del("analysis", `DELETE FROM analysis WHERE ${analysisScope}`, learnerId);
    del(
      "coach_message",
      `DELETE FROM coach_message WHERE session_id IN
         (SELECT id FROM coach_session WHERE learner_id = ?)`,
      learnerId,
    );
    del("execution", `DELETE FROM execution WHERE ${executionScope}`, learnerId);
    del("coach_session", `DELETE FROM coach_session WHERE learner_id = ?`, learnerId);
    del(
      "interview_turn",
      `DELETE FROM interview_turn WHERE session_id IN
         (SELECT id FROM interview_session WHERE learner_id = ?)`,
      learnerId,
    );
    del("interview_session", `DELETE FROM interview_session WHERE learner_id = ?`, learnerId);
    del("memory_note", `DELETE FROM memory_note WHERE learner_id = ?`, learnerId);
    del("credential", `DELETE FROM credential WHERE learner_id = ?`, learnerId);
    del("review_schedule", `DELETE FROM review_schedule WHERE learner_id = ?`, learnerId);
    del("topic_progress", `DELETE FROM topic_progress WHERE learner_id = ?`, learnerId);

    return counts;
  })();

  return NextResponse.json({ ok: true, learnerId, removed });
}
