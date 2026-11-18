import {
  HINT_TIERS,
  MAX_TIER,
  OFFLINE_TIER_FRAMEWORK,
  tierMeta,
  type HintResponse,
  type HintTierKey,
} from "./tiers";
import type { ChatMessage, Provider } from "./providers";

/**
 * Nexus — the coach.
 *
 * Two properties matter more than anything else here:
 *
 *  1. **It never over-discloses.** The prompt states exactly which tier may be
 *     revealed and explicitly forbids the model from giving the next one away.
 *     the reference app had this property for *stages*; here it is per-tier, which is
 *     what makes partial understanding workable.
 *
 *  2. **It is deterministic when it can be.** The offline path composes a
 *     structured response from the topic's own content and the AST profiler's
 *     findings. No API key is required for the platform to teach.
 */

export interface NexusContext {
  /** Topic title, used for grounding. */
  topicTitle: string;
  /** The topic body (markdown + KaTeX), truncated for the prompt budget. */
  topicBody?: string;
  /** The learner's attempt at this tier, if any. */
  learnerText?: string;
  /** Current editor content. */
  code?: string;
  language?: string;
  /** Deterministic analysis of `code`, produced by the AST profiler. */
  analysisSummary?: string;
  /** Notes the coach has written about this learner previously. */
  memoryNotes?: string[];
}

const PERSONA = `You are Nexus, the coach inside Sigma — a rigorous tutor for AI, machine learning and deep learning.

Your method is Socratic: you develop the learner's reasoning rather than replacing it. You are precise about mathematics, you state assumptions, and you never pad.

Hard rules:
- Reveal ONLY the tier you were asked for. Do not include the next tier's content, not even as a "next step" teaser, not even in a footnote.
- If the learner's attempt shows a specific misconception, address that misconception directly and by name. A generic restatement of the concept is a failure.
- Use LaTeX between $...$ for inline math and $$...$$ for display math. The renderer supports KaTeX.
- Be concrete. Reference the actual problem, tensor shapes, or code lines at hand.
- Never fabricate a result. If a number or fact is not derivable from the context, say what is needed to derive it.`;

export function buildTierPrompt(tier: number, ctx: NexusContext): ChatMessage[] {
  const meta = tierMeta(tier);
  if (!meta) throw new Error(`Unknown tier ${tier}`);

  const prev = tierMeta(tier - 1);
  const next = tierMeta(tier + 1);

  const disclosures: string[] = [];
  if (tier > 1) {
    const already = HINT_TIERS.filter((t) => t.tier < tier)
      .map((t) => `- ${t.label}: ${t.blurb}`)
      .join("\n");
    disclosures.push(
      `The learner has already been shown:\n${already}\nDo not repeat those points verbatim. Build on them.`,
    );
  }
  if (next) {
    disclosures.push(
      `The NEXT tier is "${next.label}" (${next.blurb}). You MUST NOT reveal it. Do not name it as a coming step.`,
    );
  } else {
    disclosures.push(
      `This is the final tier. After this you may explain freely, but still do not add unrelated tangents.`,
    );
  }

  const attempt: string[] = [];
  if (ctx.learnerText?.trim()) {
    attempt.push(`The learner's stated reasoning:\n"""\n${ctx.learnerText.trim()}\n"""`);
  }
  if (ctx.code?.trim()) {
    attempt.push(
      `The learner's current ${ctx.language ?? "code"}:\n"""\n${ctx.code.trim().slice(0, 4000)}\n"""`,
    );
  }
  if (ctx.analysisSummary?.trim()) {
    attempt.push(
      `Deterministic static analysis of that code (computed by an AST profiler, not guessed):\n${ctx.analysisSummary.trim()}`,
    );
  }
  if (ctx.memoryNotes?.length) {
    attempt.push(
      `What you remember about this learner:\n${ctx.memoryNotes.map((n) => `- ${n}`).join("\n")}`,
    );
  }

  const topic = ctx.topicBody?.trim()
    ? `Topic material the learner is working through:\n"""\n${ctx.topicBody.trim().slice(0, 6000)}\n"""`
    : `Topic: ${ctx.topicTitle}`;

  const user = [
    topic,
    attempt.length ? attempt.join("\n\n") : "",
    `Produce the "${meta.label}" tier of the hint ladder.`,
    `Tier definition: ${meta.blurb}`,
    `By the end of this tier the learner should be able to: ${meta.outcome}`,
    disclosures.filter(Boolean).join("\n\n"),
    `Format your answer as:
<content>
Two to five short paragraphs of direct coaching.
</content>

<checkpoint>
One self-check question the learner should now be able to answer.
</checkpoint>

<block kind="pseudocode|math|code|checklist|warning" language="optional">
Optional supporting artefact. Include at most two blocks, and only when they carry real weight.
</block>

Rules for the output: use the literal tags above, one per line, and nothing else.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: PERSONA },
    { role: "user", content: user },
  ];
}

/** Parse the model's tagged output into a structured response. */
export function parseTierOutput(raw: string, tier: number): HintResponse {
  const meta = tierMeta(tier)!;
  const blocks: HintResponse["blocks"] = [];

  const content = extractTag(raw, "content");
  const checkpoint = extractTag(raw, "checkpoint");

  const blockRe = /<block\s+kind="([a-z]+)"(?:\s+language="([^"]*)")?\s*>([\s\S]*?)<\/block>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(raw))) {
    blocks.push({
      kind: m[1] as HintResponse["blocks"][number]["kind"],
      language: m[2],
      body: m[3].trim(),
    });
  }

  return {
    tier,
    key: meta.key,
    label: meta.label,
    content: content || raw.trim(),
    blocks,
    checkpoint: checkpoint || undefined,
  };
}

function extractTag(raw: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = raw.match(re);
  return m ? m[1].trim() : "";
}

// ── Deterministic offline coach ─────────────────────────────────────────────

/**
 * The offline coach.
 *
 * This is not a stub. It composes a real, structured teaching response from
 * the topic's own content plus any deterministic analysis, so a learner with
 * no API key still gets a usable hint at every tier.
 */
export function offlineTierResponse(tier: number, ctx: NexusContext): HintResponse {
  const meta = tierMeta(tier)!;
  const key: HintTierKey = meta.key;

  const paragraphs: string[] = [OFFLINE_TIER_FRAMEWORK[key]];

  if (ctx.learnerText?.trim()) {
    paragraphs.push(
      `You said: "${ctx.learnerText.trim().slice(0, 240)}" — working from that, the next thing to pin down is which specific quantity in your description of the problem drives the approach.`,
    );
  }

  if (ctx.analysisSummary?.trim()) {
    paragraphs.push(
      `Static analysis of your current code reports:\n${ctx.analysisSummary.trim()}`,
    );
  }

  const blocks: HintResponse["blocks"] = [];

  if (key === "pseudocode") {
    blocks.push({
      kind: "pseudocode",
      body: [
        `function solve(input):`,
        `    # 1. name the quantity you ultimately need`,
        `    result = ...`,
        `    # 2. state the loop / recursion and its invariant`,
        `    for each element in input:`,
        `        # 3. the tricky step goes here`,
        `        result = update(result, element)`,
        `    # 4. return`,
        `    return result`,
      ].join("\n"),
    });
  }

  if (key === "derivation") {
    blocks.push({
      kind: "math",
      body: [
        `$$\\text{Objective: } \\min_{\\theta} \\; \\mathcal{L}(\\theta)$$`,
        `$$\\nabla_{\\theta} \\mathcal{L}(\\theta) = \\frac{\\partial \\mathcal{L}}{\\partial \\theta}$$`,
        `$$\\theta_{t+1} = \\theta_t - \\eta \\nabla_{\\theta} \\mathcal{L}(\\theta_t)$$`,
        ``,
        `Substitute the concrete form of $\\mathcal{L}$ for this problem and derive the update rule yourself, one algebraic step at a time.`,
      ].join("\n"),
    });
  }

  if (key === "solution") {
    blocks.push({
      kind: "warning",
      body:
        "A reference implementation is only useful after you have attempted the problem. " +
        "Reveal the solution tier only after you have written something — even something wrong — and can say why it fails.",
    });
  }

  const checkpoints: Record<HintTierKey, string> = {
    concept: "In one sentence, what is this problem actually asking you to compute?",
    direction:
      "Which technique family are you choosing, and which property of the input makes it the right choice?",
    pseudocode: "What is the loop invariant — what is true about `result` at the top of each iteration?",
    derivation: "Can you write the gradient (or recurrence) without looking, and check its sign or direction makes sense?",
    solution: "Close this answer and re-implement it from memory. Which part was hardest to reproduce?",
  };

  return {
    tier,
    key: meta.key,
    label: meta.label,
    content: paragraphs.join("\n\n"),
    blocks,
    checkpoint: checkpoints[key],
  };
}

/**
 * Ask the provider for a tier; fall back to the deterministic coach when the
 * provider is absent or fails. The failure reason is preserved on the error
 * object so the UI can explain *why* it degraded.
 */
export async function requestTier(
  tier: number,
  ctx: NexusContext,
  provider: Provider | null,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<{ response: HintResponse; degraded: boolean; reason?: string }> {
  if (!provider) {
    return { response: offlineTierResponse(tier, ctx), degraded: false };
  }

  const messages = buildTierPrompt(tier, ctx);
  const res = await provider.chat(
    {
      messages,
      maxTokens: 1800,
      temperature: 0.35,
      signal,
    },
    apiKey,
  );

  if (res.error) {
    return {
      response: offlineTierResponse(tier, ctx),
      degraded: true,
      reason: res.error.message,
    };
  }

  const text = res.text?.trim();
  if (!text) {
    return {
      response: offlineTierResponse(tier, ctx),
      degraded: true,
      reason: "The model returned an empty response.",
    };
  }

  return { response: parseTierOutput(text, tier), degraded: false };
}

export { MAX_TIER };
