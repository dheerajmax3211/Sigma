import { z } from "zod";

/**
 * The hint ladder.
 *
 * The reference app used a linear 5-stage flow (intuition -> brute force -> optimize ->
 * compare -> final) where each stage asked a fixed question. That works for
 * DSA problems but fails for ML/DL material, where the useful next step
 * depends on *what* the learner is stuck on, not on where they are in a script.
 *
 * Nexus instead models five escalating tiers of disclosure. A tier can be
 * requested directly, and the ladder records what has been revealed so the
 * coach never repeats itself or hands over more than the learner asked for.
 */

export const HINT_TIERS = [
  {
    tier: 1,
    key: "concept",
    label: "Concept",
    blurb: "The idea behind the approach — what problem this actually is.",
    // What the learner should be able to do after this tier.
    outcome: "Name the underlying concept and why it applies here.",
    reveal: "narrative" as const,
  },
  {
    tier: 2,
    key: "direction",
    label: "Direction",
    blurb: "Which algorithmic or mathematical direction to take.",
    outcome: "Point at the right family of solution without committing to details.",
    reveal: "narrative" as const,
  },
  {
    tier: 3,
    key: "pseudocode",
    label: "Pseudocode",
    blurb: "The shape of the solution as a skeleton, without real code.",
    outcome: "Write the control flow yourself from a structural sketch.",
    reveal: "code" as const,
  },
  {
    tier: 4,
    key: "derivation",
    label: "Derivation",
    blurb: "The mathematics worked out — the actual equations.",
    outcome: "Justify every step of the solution symbolically.",
    reveal: "code" as const,
  },
  {
    tier: 5,
    key: "solution",
    label: "Full Solution",
    blurb: "A complete, reference implementation with explanation.",
    outcome: "Have a working reference to study and modify.",
    reveal: "code" as const,
  },
] as const;

export type HintTierKey = (typeof HINT_TIERS)[number]["key"];
export type HintTierNumber = (typeof HINT_TIERS)[number]["tier"];
export const MAX_TIER = HINT_TIERS.length;

export function tierMeta(tier: number) {
  return HINT_TIERS.find((t) => t.tier === tier) ?? null;
}

export function nextTier(current: number): number | null {
  return current < MAX_TIER ? current + 1 : null;
}

/** Every tier at or below `revealed` is considered disclosed. */
export function isDisclosed(revealed: number, tier: number): boolean {
  return tier <= revealed;
}

// ── Request/response contracts ───────────────────────────────────────────────

export const HintRequestSchema = z.object({
  sessionId: z.string().min(1),
  tier: z.number().int().min(1).max(MAX_TIER),
  /** The learner's own attempt, so the coach can be specific. */
  learnerText: z.string().optional(),
  /** Current editor content, when the learner is writing code. */
  code: z.string().optional(),
  language: z.string().optional(),
});

export type HintRequest = z.infer<typeof HintRequestSchema>;

export const HintResponseSchema = z.object({
  tier: z.number().int(),
  key: z.string(),
  label: z.string(),
  content: z.string(),
  /** Optional structured payload: pseudocode blocks, equations, checkpoints. */
  blocks: z
    .array(
      z.object({
        kind: z.enum(["pseudocode", "math", "code", "checklist", "warning", "diagram"]),
        language: z.string().optional(),
        body: z.string(),
        /** For `kind: "diagram"`, a structured diagram payload. */
        diagram: z.unknown().optional(),
      }),
    )
    .default([]),
  /** Self-check question the learner should be able to answer now. */
  checkpoint: z.string().optional(),
});

export type HintResponse = z.infer<typeof HintResponseSchema>;

/**
 * A deterministic, offline fallback for each tier.
 *
 * This matters: the platform must be useful with no API key at all. When a
 * provider is configured, these are replaced by model output; when one is not,
 * the learner still gets a structured, correct skeleton to work from.
 */
export const OFFLINE_TIER_FRAMEWORK: Record<HintTierKey, string> = {
  concept:
    "Start from first principles: restate the problem in your own words, name the quantity you ultimately need, and identify the structure in the input that makes the naive approach expensive.",
  direction:
    "Choose a direction before writing code. Name the family of technique (scan / hash / divide-and-conquer / dynamic programming / transform / optimize), and say which specific property of the input your technique exploits.",
  pseudocode:
    "Write the skeleton first — inputs, the loop or recursion, the accumulator or state, and the return. Leave the tricky inner step as a named placeholder with a comment.",
  derivation:
    "Now do the mathematics. State the quantity you are optimizing or computing, write the recurrence or objective explicitly, and derive the update rule or gradient step by step rather than asserting it.",
  solution:
    "A complete reference implementation follows, with the reasoning attached to each non-obvious line. Study it, then close it and rewrite it from memory.",
};
