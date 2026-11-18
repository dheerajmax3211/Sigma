/**
 * GET /api/progress/export — download every learner row this app stores.
 *
 * This is the counterpart to /api/progress/reset: a local-first app that can
 * delete your record must be able to hand it back first. The payload mirrors
 * the real schema (see `src/lib/db/schema.ts`) table for table — no invented
 * shape, no derived totals — so the file can be re-imported or inspected
 * without guessing what each key means.
 *
 * Scoping is by `learner_id` where the table has one. `execution` and
 * `analysis` have no learner column (a run belongs to a session or a topic),
 * so they are scoped through the learner's coach sessions. Rows with no
 * session at all are included: this is a single-learner local database, and
 * hiding a run the learner executed would make the export a half-truth.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import { ensureLearner } from "@/lib/progress/mastery";
import { parseJson } from "@/lib/util";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/** Local calendar date, because the filename should match the learner's day. */
function dateStamp(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET() {
  const db = getDb();
  const learnerId = ensureLearner(db);

  const rows = (sql: string, ...params: unknown[]): Row[] =>
    db.prepare(sql).all(...params) as Row[];

  const learner = db
    .prepare(`SELECT id, display_name, created_at, settings FROM learner WHERE id = ?`)
    .get(learnerId) as
    | { id: string; display_name: string | null; created_at: string; settings: string }
    | undefined;

  // `execution` has no learner_id. A run is reachable via the coach session it
  // belongs to; sessionless runs belong to this single local learner.
  const executionScope = `(session_id IS NULL OR session_id IN
      (SELECT id FROM coach_session WHERE learner_id = ?))`;
  const analysisScope = `(execution_id IN
      (SELECT id FROM execution WHERE session_id IS NULL OR session_id IN
        (SELECT id FROM coach_session WHERE learner_id = ?)))`;

  const payload = {
    app: "sigma",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    learner: {
      id: learner?.id ?? learnerId,
      displayName: learner?.display_name ?? null,
      createdAt: learner?.created_at ?? null,
      // `settings` is a JSON column; export it parsed rather than as a
      // double-encoded string.
      settings: parseJson<Record<string, unknown>>(learner?.settings, {}),
    },
    tables: {
      topic_progress: rows(
        `SELECT id, learner_id, topic_id, status, mastery, attempts, last_seen_at, mastered_at
           FROM topic_progress WHERE learner_id = ? ORDER BY last_seen_at`,
        learnerId,
      ),
      review_schedule: rows(
        `SELECT id, learner_id, topic_id, due_at, interval_days, ease, reps, lapses, updated_at
           FROM review_schedule WHERE learner_id = ? ORDER BY due_at`,
        learnerId,
      ),
      coach_session: rows(
        `SELECT id, learner_id, topic_id, kind, title, tier, status, state, created_at, updated_at
           FROM coach_session WHERE learner_id = ? ORDER BY created_at`,
        learnerId,
      ),
      coach_message: rows(
        `SELECT m.id, m.session_id, m.role, m.tier, m.content, m.annotations, m.created_at
           FROM coach_message m
           JOIN coach_session s ON s.id = m.session_id
          WHERE s.learner_id = ? ORDER BY m.created_at`,
        learnerId,
      ),
      execution: rows(
        `SELECT id, session_id, topic_id, language, code, status, stdout, stderr,
                test_results, runtime_ms, memory_kb, exit_code, created_at
           FROM execution WHERE ${executionScope} ORDER BY created_at`,
        learnerId,
      ),
      analysis: rows(
        `SELECT a.id, a.execution_id, a.language, a.result, a.created_at
           FROM analysis a WHERE ${analysisScope} ORDER BY a.created_at`,
        learnerId,
      ),
      memory_note: rows(
        `SELECT id, learner_id, kind, category, topic_id, content, source,
                embedding_dim, expires_at, created_at, updated_at
           FROM memory_note WHERE learner_id = ? ORDER BY created_at`,
        learnerId,
      ),
      credential: rows(
        `SELECT id, learner_id, provider, label, model, base_url, keychain_ref,
                is_active, created_at, last_used_at
           FROM credential WHERE learner_id = ? ORDER BY created_at`,
        learnerId,
      ),
      interview_session: rows(
        `SELECT id, learner_id, kind, level, specialty, status, plan,
                overall_score, overall_feedback, created_at, completed_at
           FROM interview_session WHERE learner_id = ? ORDER BY created_at`,
        learnerId,
      ),
      interview_turn: rows(
        `SELECT t.id, t.session_id, t.stage, t.mode, t.question, t.answer, t.rubric,
                t.score, t.feedback, t.ideal_answer, t.reference_links, t.created_at
           FROM interview_turn t
           JOIN interview_session s ON s.id = t.session_id
          WHERE s.learner_id = ? ORDER BY t.created_at`,
        learnerId,
      ),
    },
    // Being explicit about what is NOT in the file is part of an honest export.
    omitted: [
      {
        table: "memory_note",
        column: "embedding",
        reason: "binary float32 vector; regenerable from content and not human-readable",
      },
    ],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="sigma-progress-${dateStamp()}.json"`,
      "cache-control": "no-store",
    },
  });
}
