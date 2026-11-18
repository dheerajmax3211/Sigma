import { NextResponse } from "next/server";
import { z } from "zod";
import { runPython, type TestCase } from "@/lib/exec/sandbox";
import { analyzeSource } from "@/lib/analysis/complexity";
import { getDb } from "@/lib/db";
import { newId, nowIso, toJson } from "@/lib/util";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  code: z.string().max(100_000),
  language: z.string().max(24).default("python"),
  /** Function the harness should call. Without it the wrong callable may run. */
  entry: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  topicId: z.string().max(64).optional(),
  problemId: z.string().max(64).optional(),
  testCases: z
    .array(
      z.object({
        input: z.string().max(20_000),
        expected: z.string().max(20_000).optional(),
        mode: z.enum(["json", "exact"]).optional(),
        tolerance: z.number().positive().optional(),
      }),
    )
    .max(200)
    .optional(),
  timeoutMs: z.number().int().min(500).max(60_000).optional(),
});

/**
 * Execute learner code and analyse it.
 *
 * The complexity verdict comes from the deterministic AST profiler, never from
 * a language model. This is the single most important difference from
 * The reference app, which asked the model to estimate complexity and then had to
 * display a disclaimer that the number was not measured.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const result = await runPython({
    code: input.code,
    language: input.language,
    entry: input.entry,
    testCases: input.testCases as TestCase[] | undefined,
    timeoutMs: input.timeoutMs,
  });

  const analysis = analyzeSource(input.code, input.language);

  // Persist the run so history and analytics have a source of truth.
  let executionId: string | null = null;
  try {
    const db = getDb();
    executionId = newId("exe");
    db.prepare(
      `INSERT INTO execution
         (id, session_id, topic_id, language, code, status, stdout, stderr, test_results,
          runtime_ms, memory_kb, exit_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      executionId,
      input.sessionId ?? null,
      input.topicId ?? null,
      input.language,
      input.code,
      result.status,
      result.stdout,
      result.stderr,
      toJson(result.testResults ?? []),
      result.runtimeMs,
      result.memoryKb,
      result.exitCode,
      nowIso(),
    );

    db.prepare(
      `INSERT INTO analysis (id, execution_id, language, result, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(newId("ana"), executionId, input.language, toJson(analysis), nowIso());
  } catch {
    // Persistence is best-effort; a write failure must not lose the run.
  }

  return NextResponse.json({
    executionId,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    runtimeMs: result.runtimeMs,
    cpuMs: result.cpuMs,
    memoryKb: result.memoryKb,
    timedOut: result.timedOut ?? false,
    rejectionReason: result.rejectionReason,
    testResults: result.testResults ?? null,
    passedCount: result.passedCount ?? null,
    totalCount: result.totalCount ?? null,
    analysis,
  });
}
