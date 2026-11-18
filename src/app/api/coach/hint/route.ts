import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { newId, nowIso, parseJson, toJson } from "@/lib/util";
import { getTopic } from "@/lib/content/loader";
import { requestTier } from "@/lib/coach/nexus";
import { MAX_TIER, tierMeta } from "@/lib/coach/tiers";
import { getProvider, type ProviderId } from "@/lib/coach/providers";
import { analyzeSource, summarizeAnalysis } from "@/lib/analysis/complexity";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  sessionId: z.string().min(1).optional(),
  topicId: z.string().min(1).optional(),
  tier: z.number().int().min(1).max(MAX_TIER),
  learnerText: z.string().max(8000).optional(),
  code: z.string().max(40000).optional(),
  language: z.string().max(24).optional(),
  provider: z.string().max(24).optional(),
});

/**
 * The hint ladder endpoint.
 *
 * Two design decisions worth stating:
 *  1. The tier is server-enforced. A client can only ask for the *next*
 *     unrevealed tier (or an already-revealed one, which is free). It cannot
 *     jump straight to the solution.
 *  2. Deterministic analysis of the learner's code is computed here and
 *     injected into the prompt, so the coach reasons about the actual code
 *     rather than guessing at it.
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

  const db = getDb();

  // Resolve or create the learner + session.
  let learner = db.prepare(`SELECT id FROM learner ORDER BY created_at LIMIT 1`).get() as
    | { id: string }
    | undefined;
  if (!learner) {
    const id = newId("lrn");
    db.prepare(`INSERT INTO learner (id, display_name) VALUES (?, ?)`).run(id, "Learner");
    learner = { id };
  }

  let sessionId = input.sessionId;
  if (!sessionId) {
    sessionId = newId("ses");
    db.prepare(
      `INSERT INTO coach_session (id, learner_id, topic_id, kind, title, tier, status, state, created_at, updated_at)
       VALUES (?, ?, ?, 'topic', ?, 0, 'active', '{}', ?, ?)`,
    ).run(
      sessionId,
      learner.id,
      input.topicId ?? null,
      input.topicId ? (getTopic(input.topicId)?.title ?? null) : null,
      nowIso(),
      nowIso(),
    );
  }

  const session = db
    .prepare(`SELECT id, topic_id, tier, state FROM coach_session WHERE id = ?`)
    .get(sessionId) as
    | { id: string; topic_id: string | null; tier: number; state: string }
    | undefined;

  if (!session) {
    return NextResponse.json({ error: "Unknown session." }, { status: 404 });
  }

  const revealedTier = session.tier;

  // Gate: you may ask for any tier <= revealed+1. Not higher.
  if (input.tier > revealedTier + 1) {
    return NextResponse.json(
      {
        error: `Tier ${input.tier} is locked. Reveal tier ${revealedTier + 1} first.`,
        maxAvailableTier: revealedTier + 1,
      },
      { status: 409 },
    );
  }

  const topic = session.topic_id ? getTopic(session.topic_id) : null;

  // Deterministic analysis of the learner's code — computed, not guessed.
  let analysisSummary: string | undefined;
  if (input.code?.trim()) {
    const analysis = analyzeSource(input.code, input.language ?? "python");
    analysisSummary = summarizeAnalysis(analysis);
  }

  // Static hints from the content file take precedence over model output:
  // they are authored, reviewed, and correct by construction.
  const authored = topic?.body.hints.find((h) => h.tier === input.tier);

  // Provider selection: explicit request, else the learner's saved active
  // credential, else the deterministic offline coach.
  const requestedProvider = (input.provider ?? "") as ProviderId;
  const activeCred = db
    .prepare(
      `SELECT provider, model, keychain_ref FROM credential WHERE learner_id = ? AND is_active = 1 LIMIT 1`,
    )
    .get(learner.id) as { provider: ProviderId; model: string | null } | undefined;

  const providerId = requestedProvider || activeCred?.provider || "local";
  const provider = getProvider(providerId);

  let result: Awaited<ReturnType<typeof requestTier>>;

  if (authored && providerId === "local") {
    // Authored ladder, served without a model.
    result = {
      response: {
        tier: authored.tier,
        key: tierMeta(authored.tier)?.key ?? "concept",
        label: authored.title ?? tierMeta(authored.tier)?.label ?? "",
        content: authored.content,
        blocks: authored.blocks,
        checkpoint: authored.checkpoint,
      },
      degraded: false,
    };
  } else {
    const ctx = {
      topicTitle: topic?.title ?? "General ML question",
      topicBody: topic?.body.markdown,
      learnerText: input.learnerText,
      code: input.code,
      language: input.language,
      analysisSummary,
      memoryNotes: readMemoryNotes(db, learner.id),
    };
    result = await requestTier(input.tier, ctx, providerId === "local" ? null : provider, undefined);
  }

  // Persist the exchange.
  db.prepare(
    `INSERT INTO coach_message (id, session_id, role, tier, content, annotations, created_at)
     VALUES (?, ?, 'coach', ?, ?, ?, ?)`,
  ).run(
    newId("msg"),
    sessionId,
    input.tier,
    result.response.content,
    toJson({ blocks: result.response.blocks, checkpoint: result.response.checkpoint }),
    nowIso(),
  );

  if (input.learnerText?.trim()) {
    db.prepare(
      `INSERT INTO coach_message (id, session_id, role, tier, content, annotations, created_at)
       VALUES (?, ?, 'user', ?, ?, NULL, ?)`,
    ).run(newId("msg"), sessionId, input.tier, input.learnerText, nowIso());
  }

  // Advance the session's revealed tier.
  if (input.tier > revealedTier) {
    db.prepare(`UPDATE coach_session SET tier = ?, updated_at = ? WHERE id = ?`).run(
      input.tier,
      nowIso(),
      sessionId,
    );
  }

  return NextResponse.json({
    sessionId,
    tier: result.response.tier,
    label: result.response.label,
    content: result.response.content,
    blocks: result.response.blocks,
    checkpoint: result.response.checkpoint,
    degraded: result.degraded,
    reason: result.reason,
    revealedTier: Math.max(revealedTier, input.tier),
    nextTier: Math.max(revealedTier, input.tier) < MAX_TIER ? Math.max(revealedTier, input.tier) + 1 : null,
    analysisSummary,
  });
}

function readMemoryNotes(db: ReturnType<typeof getDb>, learnerId: string): string[] {
  const rows = db
    .prepare(
      `SELECT content FROM memory_note
       WHERE learner_id = ? AND kind = 'long_term' AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC LIMIT 5`,
    )
    .all(learnerId, nowIso()) as { content: string }[];
  return rows.map((r) => r.content);
}
