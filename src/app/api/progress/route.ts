import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  decayMastery,
  dueTopics,
  ensureLearner,
  readProgress,
  recordProgress,
  recordReview,
} from "@/lib/progress/mastery";

export const dynamic = "force-dynamic";

const PostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review"),
    topicId: z.string().min(1),
    grade: z.number().int().min(0).max(5),
    problemsPassed: z.number().int().min(0).default(0),
    problemsTotal: z.number().int().min(0).default(0),
    hintTier: z.number().int().min(0).max(5).default(0),
    checkpointsPassed: z.number().int().min(0).default(0),
    checkpointsTotal: z.number().int().min(0).default(0),
  }),
  z.object({
    action: z.literal("touch"),
    topicId: z.string().min(1),
    problemsPassed: z.number().int().min(0).default(0),
    problemsTotal: z.number().int().min(0).default(0),
    hintTier: z.number().int().min(0).max(5).default(0),
    checkpointsPassed: z.number().int().min(0).default(0),
    checkpointsTotal: z.number().int().min(0).default(0),
  }),
]);

export async function GET() {
  const db = getDb();
  const learnerId = ensureLearner(db);

  const rows = db
    .prepare(
      `SELECT p.topic_id, p.status, p.mastery, p.attempts, p.last_seen_at, p.mastered_at,
              r.due_at, r.interval_days, r.reps, r.lapses,
              t.title, t.track_id
         FROM topic_progress p
         JOIN topic t ON t.id = p.topic_id
         LEFT JOIN review_schedule r
           ON r.learner_id = p.learner_id AND r.topic_id = p.topic_id
        WHERE p.learner_id = ?
        ORDER BY p.mastery ASC`,
    )
    .all(learnerId) as {
    topic_id: string;
    status: string;
    mastery: number;
    attempts: number;
    last_seen_at: string | null;
    mastered_at: string | null;
    due_at: string | null;
    interval_days: number | null;
    reps: number | null;
    lapses: number | null;
    title: string;
    track_id: string | null;
  }[];

  // Report decayed mastery alongside the stored value, so a learner can see
  // that a number they earned two intervals ago is no longer current.
  const progress = rows.map((r) => ({
    ...r,
    effective_mastery: decayMastery(r.mastery, r.due_at),
    overdue: r.due_at ? new Date(r.due_at).getTime() <= Date.now() : true,
  }));

  const totals = {
    tracked: progress.length,
    mastered: progress.filter((p) => p.status === "mastered").length,
    inProgress: progress.filter((p) => p.status === "in_progress").length,
    dueNow: progress.filter((p) => p.overdue).length,
    meanMastery:
      progress.length > 0
        ? Number(
            (
              progress.reduce((n, p) => n + p.effective_mastery, 0) / progress.length
            ).toFixed(4),
          )
        : 0,
  };

  return NextResponse.json({ totals, progress, due: dueTopics(db, learnerId) });
}

export async function POST(req: Request) {
  let body;
  try {
    body = PostSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }

  const db = getDb();
  const learnerId = ensureLearner(db);

  const topic = db.prepare(`SELECT id FROM topic WHERE id = ?`).get(body.topicId) as
    | { id: string }
    | undefined;
  if (!topic) {
    return NextResponse.json({ error: `unknown topic ${body.topicId}` }, { status: 404 });
  }

  const before = readProgress(db, learnerId, body.topicId);

  const inputs = {
    problemsPassed: body.problemsPassed,
    problemsTotal: body.problemsTotal,
    hintTier: body.hintTier,
    checkpointsPassed: body.checkpointsPassed,
    checkpointsTotal: body.checkpointsTotal,
    reviewsSurvived: before ? Math.max(0, (before.attempts ?? 0)) : 0,
  };

  const progress = recordProgress(db, { learnerId, topicId: body.topicId, inputs });

  if (body.action === "review") {
    const schedule = recordReview(db, {
      learnerId,
      topicId: body.topicId,
      grade: body.grade as 0 | 1 | 2 | 3 | 4 | 5,
    });
    return NextResponse.json({ progress, schedule });
  }

  return NextResponse.json({ progress });
}
