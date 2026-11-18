import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/util";
import {
  allQuestions,
  feedbackFor,
  findQuestion,
  questionsFor,
  scoreAnswer,
  summarise,
  type InterviewKind,
  type InterviewLevel,
} from "@/lib/interview/engine";

export const dynamic = "force-dynamic";

const StartSchema = z.object({
  action: z.literal("start"),
  kind: z.enum(["system_design", "coding", "behavioral", "ml_system"]),
  level: z.enum(["junior", "mid", "senior", "staff", "principal"]).default("senior"),
  questionId: z.string().optional(),
});

const AnswerSchema = z.object({
  action: z.literal("answer"),
  sessionId: z.string().min(1),
  answer: z.string().max(20000),
});

const AbandonSchema = z.object({
  action: z.literal("abandon"),
  sessionId: z.string().min(1),
});

const SelfScoreSchema = z.object({
  action: z.literal("selfscore"),
  sessionId: z.string().min(1),
  stage: z.string().min(1),
  /** Criterion ids the learner judges their own answer covered. */
  covered: z.array(z.string()).default([]),
});

const BodySchema = z.discriminatedUnion("action", [
  StartSchema,
  AnswerSchema,
  SelfScoreSchema,
  AbandonSchema,
]);

/** Resolve or create the single local learner, matching the coach route. */
function learnerId(db: ReturnType<typeof getDb>): string {
  const row = db.prepare(`SELECT id FROM learner ORDER BY created_at LIMIT 1`).get() as
    | { id: string }
    | undefined;
  if (row) return row.id;
  const id = newId("lrn_");
  db.prepare(`INSERT INTO learner (id, display_name) VALUES (?, ?)`).run(id, "Learner");
  return id;
}

function sessionPayload(db: ReturnType<typeof getDb>, sessionId: string) {
  const session = db
    .prepare(
      `SELECT id, kind, level, status, plan, overall_score, overall_feedback, created_at
         FROM interview_session WHERE id = ?`,
    )
    .get(sessionId) as
    | {
        id: string;
        kind: string;
        level: string;
        status: string;
        plan: string;
        overall_score: number | null;
        overall_feedback: string | null;
        created_at: string;
      }
    | undefined;
  if (!session) return null;

  const turns = db
    .prepare(
      `SELECT id, stage, mode, question, answer, score, feedback, ideal_answer, rubric
         FROM interview_turn WHERE session_id = ? ORDER BY created_at, rowid`,
    )
    .all(sessionId) as {
    id: string;
    stage: string;
    mode: string;
    question: string;
    answer: string | null;
    score: number | null;
    feedback: string | null;
    ideal_answer: string | null;
    rubric: string | null;
  }[];

  return {
    session: {
      ...session,
      plan: JSON.parse(session.plan || "{}"),
    },
    turns: turns.map((t) => ({
      ...t,
      rubric: t.rubric ? JSON.parse(t.rubric) : null,
    })),
  };
}

export async function GET(req: Request) {
  const db = getDb();
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (sessionId) {
    const payload = sessionPayload(db, sessionId);
    if (!payload) return NextResponse.json({ error: "session not found" }, { status: 404 });
    return NextResponse.json(payload);
  }

  const sessions = db
    .prepare(
      `SELECT id, kind, level, status, overall_score, created_at
         FROM interview_session ORDER BY created_at DESC LIMIT 20`,
    )
    .all();

  return NextResponse.json({
    questions: allQuestions().map((q) => ({
      id: q.id,
      kind: q.kind,
      level: q.level,
      title: q.title,
      prompt: q.prompt,
      stages: q.stages.length,
      referenceTopics: q.referenceTopics,
    })),
    sessions,
  });
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }

  const db = getDb();

  // ── Start ──────────────────────────────────────────────────────────────
  if (parsed.action === "start") {
    const kind = parsed.kind as InterviewKind;
    const level = parsed.level as InterviewLevel;

    const pool = questionsFor(kind);
    const question =
      (parsed.questionId ? findQuestion(parsed.questionId) : undefined) ??
      pool[0] ??
      allQuestions()[0];

    if (!question) {
      return NextResponse.json({ error: `no questions for kind ${kind}` }, { status: 404 });
    }

    const learner = learnerId(db);
    const sessionId = newId("ivs_");

    const plan = {
      questionId: question.id,
      title: question.title,
      prompt: question.prompt,
      stageIndex: 0,
      stageIds: question.stages.map((s) => s.id),
      referenceTopics: question.referenceTopics,
    };

    db.prepare(
      `INSERT INTO interview_session (id, learner_id, kind, level, status, plan)
       VALUES (?, ?, ?, ?, 'active', ?)`,
    ).run(sessionId, learner, kind, level, JSON.stringify(plan));

    const first = question.stages[0];
    db.prepare(
      `INSERT INTO interview_turn (id, session_id, stage, mode, question)
       VALUES (?, ?, ?, 'oral', ?)`,
    ).run(newId("ivt_"), sessionId, first.id, first.question);

    return NextResponse.json({
      sessionId,
      plan,
      stage: {
        id: first.id,
        index: 0,
        total: question.stages.length,
        question: first.question,
        intent: first.intent,
      },
    });
  }

  // ── Abandon ────────────────────────────────────────────────────────────
  if (parsed.action === "abandon") {
    db.prepare(`UPDATE interview_session SET status = 'abandoned' WHERE id = ?`).run(
      parsed.sessionId,
    );
    return NextResponse.json({ ok: true });
  }

  // ── Answer: record it, hand back the rubric ──────────────────────────────
  //
  // Grading is deliberately NOT the regex score.
  //
  // A regex cannot distinguish a well-phrased correct answer from keyword
  // soup, and a learner who writes "bounded, so counting sort is O(n) with a
  // 1e5 key space" must not score 0 because they never typed "range". So the
  // deterministic match is kept as an *advisory* signal and the learner scores
  // themselves against the criteria — the same checklist an interviewer holds.
  const session = db
    .prepare(`SELECT id, status, plan FROM interview_session WHERE id = ?`)
    .get(parsed.sessionId) as { id: string; status: string; plan: string } | undefined;

  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });
  if (session.status !== "active") {
    return NextResponse.json({ error: `session is ${session.status}` }, { status: 409 });
  }

  const plan = JSON.parse(session.plan) as {
    questionId: string;
    stageIndex: number;
    stageIds: string[];
  };
  const question = findQuestion(plan.questionId);
  if (!question) return NextResponse.json({ error: "question vanished" }, { status: 500 });

  const stage = question.stages[plan.stageIndex];
  if (!stage) {
    return NextResponse.json({ error: "no stage pending" }, { status: 409 });
  }

  const ideal = {
    intent: stage.intent,
    criteria: stage.criteria.map((c) => ({ id: c.id, label: c.label, weight: c.weight })),
    hint: stage.hint,
  };

  if (parsed.action === "answer") {
    const advisory = scoreAnswer(stage, parsed.answer);
    const advisoryFeedback = feedbackFor(stage, advisory);

    const pending = db
      .prepare(
        `SELECT id FROM interview_turn
          WHERE session_id = ? AND stage = ? AND answer IS NULL
          ORDER BY rowid DESC LIMIT 1`,
      )
      .get(parsed.sessionId, stage.id) as { id: string } | undefined;

    const rubricJson = JSON.stringify({
      criteria: ideal.criteria,
      advisoryFraction: advisory.fraction,
      // `fraction` stays null until the learner self-assesses, so a partially
      // finished session can never be summarised as if it were scored.
      fraction: null,
      selfCovered: [],
    });

    if (pending) {
      db.prepare(
        `UPDATE interview_turn
            SET answer = ?, rubric = ?, score = NULL, feedback = ?, ideal_answer = ?
          WHERE id = ?`,
      ).run(parsed.answer, rubricJson, advisoryFeedback, JSON.stringify(ideal), pending.id);
    } else {
      db.prepare(
        `INSERT INTO interview_turn
           (id, session_id, stage, mode, question, answer, rubric, score, feedback, ideal_answer)
         VALUES (?, ?, ?, 'oral', ?, ?, ?, NULL, ?, ?)`,
      ).run(
        newId("ivt_"),
        parsed.sessionId,
        stage.id,
        stage.question,
        parsed.answer,
        rubricJson,
        advisoryFeedback,
        JSON.stringify(ideal),
      );
    }

    return NextResponse.json({
      review: {
        stage: stage.id,
        intent: stage.intent,
        criteria: ideal.criteria,
        hint: stage.hint,
        answer: parsed.answer,
        advisoryFraction: advisory.fraction,
        advisoryFeedback,
      },
      awaitingSelfScore: true,
      done: false,
    });
  }

  // ── Self-score: the learner's judgement is the recorded score ────────────
  const turn = db
    .prepare(
      `SELECT id, answer, rubric, ideal_answer FROM interview_turn
        WHERE session_id = ? AND stage = ? AND answer IS NOT NULL
        ORDER BY rowid DESC LIMIT 1`,
    )
    .get(parsed.sessionId, stage.id) as
    | { id: string; answer: string; rubric: string; ideal_answer: string | null }
    | undefined;

  if (!turn) {
    return NextResponse.json({ error: "answer that stage first" }, { status: 409 });
  }

  const criteria = (
    JSON.parse(turn.ideal_answer ?? JSON.stringify(ideal)) as {
      criteria: { id: string; label: string; weight: number }[];
    }
  ).criteria;

  const covered = new Set(parsed.covered);
  const totalWeight = criteria.reduce((n, c) => n + (c.weight ?? 1), 0) || 1;
  const coveredWeight = criteria
    .filter((c) => covered.has(c.id))
    .reduce((n, c) => n + (c.weight ?? 1), 0);
  const fraction = coveredWeight / totalWeight;
  const score = Math.round(fraction * 100);

  const priorRubric = JSON.parse(turn.rubric) as Record<string, unknown>;
  db.prepare(`UPDATE interview_turn SET score = ?, rubric = ? WHERE id = ?`).run(
    score,
    JSON.stringify({
      ...priorRubric,
      fraction,
      selfCovered: [...covered],
      scoredAt: new Date().toISOString(),
    }),
    turn.id,
  );

  const nextIndex = plan.stageIndex + 1;
  const nextStage = question.stages[nextIndex];

  if (nextStage) {
    const nextPlan = { ...plan, stageIndex: nextIndex };
    db.prepare(`UPDATE interview_session SET plan = ? WHERE id = ?`).run(
      JSON.stringify(nextPlan),
      parsed.sessionId,
    );
    db.prepare(
      `INSERT INTO interview_turn (id, session_id, stage, mode, question)
       VALUES (?, ?, ?, 'oral', ?)`,
    ).run(newId("ivt_"), parsed.sessionId, nextStage.id, nextStage.question);

    return NextResponse.json({
      selfScore: { stage: stage.id, score, fraction, covered: [...covered] },
      stage: {
        id: nextStage.id,
        index: nextIndex,
        total: question.stages.length,
        question: nextStage.question,
        intent: nextStage.intent,
      },
      done: false,
    });
  }

  // Session complete — aggregate only turns the learner actually scored.
  const rows = db
    .prepare(
      `SELECT stage, rubric FROM interview_turn
        WHERE session_id = ? AND rubric IS NOT NULL`,
    )
    .all(parsed.sessionId) as { stage: string; rubric: string }[];

  const turns = rows.map((r) => {
    const parsedRubric = JSON.parse(r.rubric) as { fraction: number | null };
    return { stage: r.stage, fraction: parsedRubric.fraction ?? 0, verdict: "" };
  });
  const summary = summarise(turns);

  db.prepare(
    `UPDATE interview_session
        SET status = 'completed', overall_score = ?, overall_feedback = ?
      WHERE id = ?`,
  ).run(summary.overall, summary.text, parsed.sessionId);

  return NextResponse.json({
    selfScore: { stage: stage.id, score, fraction, covered: [...covered] },
    done: true,
    summary: {
      overall: summary.overall,
      text: summary.text,
      weakest: summary.weakest,
      referenceTopics: question.referenceTopics,
    },
  });
}
