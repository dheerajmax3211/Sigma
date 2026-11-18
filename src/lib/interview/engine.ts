/**
 * Mock technical interview engine.
 *
 * The tables `interview_session` and `interview_turn` existed from the first
 * migration and nothing ever wrote to them — this module is what they were
 * for.
 *
 * Design decision, stated plainly because it determines whether you can trust
 * the score: **grading is a deterministic rubric matcher, not a language
 * model.** Each stage declares the criteria a strong answer covers, with
 * patterns that indicate coverage. The score is the weighted fraction covered,
 * and the feedback names what was missed. That makes the score reproducible,
 * auditable, and honest. A model may later *explain* a score, but it must
 * never produce it — the same rule the complexity profiler follows.
 */

import { getContent } from "@/lib/content/loader";

export type InterviewKind = "system_design" | "coding" | "behavioral" | "ml_system";
export type InterviewLevel = "junior" | "mid" | "senior" | "staff" | "principal";

export interface Criterion {
  id: string;
  /** What a strong answer does. */
  label: string;
  /** Any match counts as coverage. Case-insensitive. */
  patterns: RegExp[];
  weight: number;
}

export interface Stage {
  id: string;
  /** What the interviewer says. */
  question: string;
  /** Why this stage exists, shown after answering. */
  intent: string;
  criteria: Criterion[];
  /** Shown when the learner misses most criteria. */
  hint: string;
}

export interface Question {
  id: string;
  kind: InterviewKind;
  level: InterviewLevel;
  title: string;
  /** The one-line problem statement. */
  prompt: string;
  stages: Stage[];
  /** Topic ids in this corpus that teach the underlying material. */
  referenceTopics: string[];
}

/* ──────────────────────────────────────────────────────────────────────────
   Question bank
   ────────────────────────────────────────────────────────────────────────── */

export const QUESTIONS: Question[] = [
  {
    id: "q-topk",
    kind: "coding",
    level: "senior",
    title: "Top-K Frequent Elements",
    prompt:
      "Given an integer array of length n and an integer k, return the k most frequent elements. Discuss the trade-offs between your approaches.",
    referenceTopics: ["probability-distributions", "information-theory"],
    stages: [
      {
        id: "clarify",
        question:
          "Before writing anything: what do you need to know about the input, and what will you guarantee about the output?",
        intent:
          "Interviewers open here to see whether you constrain the problem before solving it. Unbounded assumptions are the most common senior-level failure.",
        criteria: [
          {
            id: "size",
            label: "asks about n and k magnitude, or states an assumption",
            patterns: [/\bn\b.{0,30}(large|size|bound|million|10\^)/i, /size of (the )?(input|array)/i, /\bassume\b/i],
            weight: 1,
          },
          {
            id: "range",
            label: "asks whether the value range is bounded (enables counting sort)",
            patterns: [/range|bounded|values? (are|is) (between|in)|max value/i],
            weight: 1.5,
          },
          {
            id: "tie",
            label: "asks how to break ties, or whether any valid k is acceptable",
            patterns: [/tie|any order|unique|deterministic/i],
            weight: 1,
          },
          {
            id: "empty",
            label: "asks about k > number of distinct elements, or empty input",
            patterns: [/k\s*(>|greater|exceed)|fewer than k|empty/i],
            weight: 1,
          },
        ],
        hint:
          "You did not pin down the value range. If values are bounded small integers, a counting array makes this O(n) — and that changes the whole answer.",
      },
      {
        id: "approach",
        question:
          "Walk me through your approach, and tell me why it beats the alternatives.",
        intent:
          "This separates people who know a heap from people who can choose between a heap, a bucket sort, and quickselect.",
        criteria: [
          {
            id: "freq",
            label: "builds a frequency map first",
            patterns: [/frequency|freq|count(ing)? map|hash ?map|dictionary|counter/i],
            weight: 1,
          },
          {
            id: "heap",
            label: "uses a min-heap of size k",
            patterns: [/heap|priority queue/i],
            weight: 1.5,
          },
          {
            id: "bucket",
            label: "mentions bucket / counting approach for O(n)",
            patterns: [/bucket|counting sort|pigeonhole|array of lists/i],
            weight: 1.5,
          },
          {
            id: "quickselect",
            label: "mentions quickselect / nth_element as an alternative",
            patterns: [/quick ?select|nth_element|partition/i],
            weight: 1,
          },
          {
            id: "tradeoff",
            label: "explicitly compares the alternatives on time and space",
            patterns: [/trade.?off|instead of|versus|vs\.|better than|worse/i],
            weight: 1.5,
          },
        ],
        hint:
          "You described one approach without comparing it. The expected answer names at least two and says when each wins — heap for streaming, bucket for bounded values, quickselect for average-case O(n) in place.",
      },
      {
        id: "complexity",
        question: "State the time and space complexity, and say what dominates.",
        intent:
          "Complexity claims are where candidates are most often confidently wrong.",
        criteria: [
          {
            id: "time",
            label: "correct time complexity (O(n log k) for the heap)",
            patterns: [/n\s*log\s*k|n\s*log\s*\(?k/i],
            weight: 2,
          },
          {
            id: "space",
            label: "space bounded by O(n) for the map or O(k) for the heap",
            patterns: [/\bo\(k\)|o\(n\)|space/i],
            weight: 1,
          },
          {
            id: "dominant",
            label: "names which term dominates and why",
            patterns: [/dominat|bottleneck|driven by|grows/i],
            weight: 1,
          },
        ],
        hint:
          "The heap holds k elements, so each of the n insertions costs log k — that is O(n log k), not O(n log n). Saying O(n log n) reveals you did not track the heap's bound.",
      },
      {
        id: "edge",
        question:
          "What fails in production that a textbook answer does not cover?",
        intent:
          "This is the staff-level question. It is asking about distribution shift, memory, and streaming.",
        criteria: [
          {
            id: "stream",
            label: "raises the streaming / unbounded-input case",
            patterns: [/stream|unbounded|online|window/i],
            weight: 1.5,
          },
          {
            id: "memory",
            label: "raises memory growth of the frequency map",
            patterns: [/memory|cardinality|memory blows|too many distinct/i],
            weight: 1.5,
          },
          {
            id: "skew",
            label: "raises heavy-hitter / sketch algorithms for huge cardinality",
            patterns: [/count.?min|sketch|heavy.?hitter|approximate/i],
            weight: 1,
          },
        ],
        hint:
          "The frequency map is the liability: with high-cardinality keys it grows without bound. Heavy-hitter sketches (Count-Min) trade exactness for bounded memory — that is the production answer.",
      },
    ],
  },
  {
    id: "q-softmax",
    kind: "coding",
    level: "senior",
    title: "Numerically Stable Softmax",
    prompt:
      "Implement softmax over a vector of logits. It must not overflow, and it must work when the logits are large in magnitude.",
    referenceTopics: ["information-theory", "numerical-linear-algebra"],
    stages: [
      {
        id: "clarify",
        question: "What can go wrong with the naive formula?",
        intent:
          "The whole question is the failure mode. A candidate who does not name it will write the broken version.",
        criteria: [
          {
            id: "overflow",
            label: "names overflow in exp() for large logits",
            patterns: [/overflow|exp(onent)? (blows|grows|overflow)|inf/i],
            weight: 2,
          },
          {
            id: "underflow",
            label: "names underflow to zero for very negative logits",
            patterns: [/underflow|flush(ed)? to zero|becomes zero/i],
            weight: 1,
          },
          {
            id: "shift",
            label: "proposes subtracting the max before exponentiating",
            patterns: [/subtract.{0,20}max|max.{0,20}subtract|shift by|log.?sum.?exp/i],
            weight: 2,
          },
        ],
        hint:
          "exp(1000) is inf in float64. Subtracting the max first is not an optimisation — it is what makes the function computable, and it does not change the result mathematically.",
      },
      {
        id: "approach",
        question: "Write the approach, and justify why the shift is valid.",
        intent:
          "The shift is only valid because softmax is invariant to a constant added to all logits. Saying that is the proof.",
        criteria: [
          {
            id: "invariance",
            label: "states softmax is invariant to adding a constant",
            patterns: [/invariant|unchanged|cancels|same result|shift invariant/i],
            weight: 2,
          },
          {
            id: "steps",
            label: "gives the three steps: subtract max, exp, normalise",
            patterns: [/subtract.{0,30}max|exp|normalis|normaliz|divide by (the )?sum/i],
            weight: 1,
          },
        ],
        hint:
          "You skipped the justification. exp(z_i - m) / Σ exp(z_j - m) = exp(z_i)/Σexp(z_j) because the factor exp(-m) appears in both numerator and denominator and cancels.",
      },
      {
        id: "complexity",
        question:
          "What is the complexity, and how many passes over the vector do you need?",
        intent:
          "Two passes is the honest answer: one for the max, one for the sum.",
        criteria: [
          {
            id: "linear",
            label: "states O(n) time",
            patterns: [/o\(n\)|linear/i],
            weight: 1,
          },
          {
            id: "passes",
            label: "states two passes (max, then exp-sum)",
            patterns: [/two pass|2 pass|second pass|first pass/i],
            weight: 1.5,
          },
        ],
        hint:
          "You need the max before you can exponentiate, so it is two passes — O(n) time but 2n reads. For very large n that memory traffic is the real cost.",
      },
      {
        id: "edge",
        question: "How would you compute log-softmax, and why does that matter?",
        intent:
          "Because computing log(softmax(x)) directly loses precision and can produce -inf. Cross-entropy losses need log-softmax.",
        criteria: [
          {
            id: "logsoftmax",
            label: "computes log-softmax directly rather than log(softmax(x))",
            patterns: [/log.?softmax|logsumexp|log.?sum.?exp/i],
            weight: 2,
          },
          {
            id: "loss",
            label: "connects it to cross-entropy loss stability",
            patterns: [/cross.?entropy|loss|nll|negative log/i],
            weight: 1.5,
          },
        ],
        hint:
          "log(softmax(x)) can be -inf when a probability underflows to 0. log-softmax computes x - logsumexp(x) directly, so the small value never passes through a probability.",
      },
    ],
  },
  {
    id: "q-fraud",
    kind: "ml_system",
    level: "staff",
    title: "Real-Time Fraud Detection",
    prompt:
      "Design a system that flags fraudulent card transactions in under 100 ms at 50,000 transactions per second. Discuss the model, the features, and what happens when you are wrong.",
    referenceTopics: ["time-series", "model-evaluation", "imbalanced-data"],
    stages: [
      {
        id: "clarify",
        question: "What do you need to know before designing this?",
        intent:
          "A staff candidate pins down the cost asymmetry immediately — a false negative and a false positive do not cost the same.",
        criteria: [
          {
            id: "cost",
            label: "asks about the relative cost of false positives vs false negatives",
            patterns: [/false positive|false negative|cost of|asymmetr/i],
            weight: 2,
          },
          {
            id: "label",
            label: "asks how fraud labels arrive and with what delay",
            patterns: [/label|chargeback|confirmed fraud|ground truth|delay/i],
            weight: 2,
          },
          {
            id: "latency",
            label: "confirms the latency budget and whether it is p99",
            patterns: [/p99|percentile|tail latency|100 ?ms|budget/i],
            weight: 1,
          },
          {
            id: "adversary",
            label: "notes that fraud is adversarial — the distribution moves",
            patterns: [/adversar|attacker|adapt|concept drift|drift/i],
            weight: 1.5,
          },
        ],
        hint:
          "You did not establish the cost asymmetry. With fraud, a missed fraud costs the transaction amount; a false decline costs a customer. Those are not symmetric, and the threshold is chosen from that ratio, not from accuracy.",
      },
      {
        id: "approach",
        question: "What is the model, and what are the features?",
        intent:
          "Expect gradient-boosted trees on engineered features, plus a real-time feature store.",
        criteria: [
          {
            id: "model",
            label: "proposes gradient-boosted trees or a comparable tabular model",
            patterns: [/gradient boost|xgboost|lightgbm|gbdt|random forest|trees/i],
            weight: 1.5,
          },
          {
            id: "features",
            label: "names behavioural/aggregate features (velocity, deviation from history)",
            patterns: [/velocity|aggregate|window|last (24|1) ?h|deviation|baseline|history/i],
            weight: 2,
          },
          {
            id: "store",
            label: "requires a low-latency feature store with train/serve consistency",
            patterns: [/feature store|online store|train.?serve|consistency|point.?in.?time/i],
            weight: 2,
          },
          {
            id: "graph",
            label: "mentions entity/graph features (device, merchant, card networks)",
            patterns: [/graph|device|merchant|network|entity|link/i],
            weight: 1,
          },
        ],
        hint:
          "The features are the model here. Velocity (how many transactions in the last hour), deviation from the cardholder's baseline, and merchant/device graph signals carry most of the signal — but they must be served within the latency budget, which is why the feature store is the hard part.",
      },
      {
        id: "complexity",
        question: "What dominates the latency budget, and how do you hit p99?",
        intent:
          "Not the model. The feature lookups and the fan-out.",
        criteria: [
          {
            id: "featurecost",
            label: "identifies feature retrieval as the dominant cost",
            patterns: [/feature (lookup|retrieval|fetch)|feature store.{0,20}(latency|cost)/i],
            weight: 2,
          },
          {
            id: "budget",
            label: "allocates an explicit budget across stages",
            patterns: [/budget|allocate|ms (for|to)|spend/i],
            weight: 1.5,
          },
          {
            id: "degrade",
            label: "has a degraded path if a dependency times out",
            patterns: [/fallback|degrad|timeout|circuit breaker|default/i],
            weight: 2,
          },
        ],
        hint:
          "Tree inference on a few hundred features is microseconds; the p99 is spent waiting on feature lookups. The design needs an explicit per-stage budget and a defined behaviour when a lookup misses its deadline.",
      },
      {
        id: "edge",
        question: "You are wrong in production. What happens next?",
        intent:
          "This tests whether you have run a system, not just designed one.",
        criteria: [
          {
            id: "monitor",
            label: "monitors precision/recall on delayed labels, not accuracy",
            patterns: [/precision|recall|auc|pr.?curve|calibrat/i],
            weight: 1.5,
          },
          {
            id: "drift",
            label: "detects drift and has a retraining trigger",
            patterns: [/drift|retrain|refresh|decay/i],
            weight: 1.5,
          },
          {
            id: "feedback",
            label: "closes the loop from chargebacks back into labels",
            patterns: [/chargeback|feedback loop|label pipeline|backfill/i],
            weight: 1.5,
          },
          {
            id: "human",
            label: "has human review for the ambiguous band",
            patterns: [/human|analyst|review queue|manual/i],
            weight: 1,
          },
        ],
        hint:
          "The label is the whole problem: fraud is confirmed weeks later via chargeback. Without a deliberate pipeline from chargeback to training label, the model silently degrades and nobody notices until losses spike.",
      },
    ],
  },
];

/**
 * Content-authored questions live in `content/interviews/*.yaml` and are merged
 * into the bank once, lazily. They are kept separate from the built-ins because
 * 150+ staged questions with hand-written rubrics belong in content (diffable,
 * reviewable), not in a TypeScript literal.
 *
 * The engine is imported only by the server route, so reaching for the loader
 * here does not pull `fs` into a client bundle.
 */
let bankMerged = false;
function ensureBank(): void {
  if (bankMerged) return;
  bankMerged = true;
  try {
    for (const item of getContent().interviews) {
      if (QUESTIONS.some((q) => q.id === item.id)) continue;
      QUESTIONS.push({
        id: item.id,
        kind: item.kind,
        level: item.level,
        title: item.title,
        prompt: item.prompt,
        referenceTopics: item.reference_topics,
        stages: item.stages.map((s) => ({
          id: s.id,
          question: s.question,
          intent: s.intent,
          hint: s.hint,
          criteria: s.criteria.map((c) => ({
            id: c.id,
            label: c.label,
            weight: c.weight,
            patterns: c.patterns.map((p) => new RegExp(p, "i")),
          })),
        })),
      });
    }
  } catch {
    // A malformed bank must not take the interview route down; the content
    // validator is the place that reports it.
  }
}

/** Every question, built-in and content-authored. */
export function allQuestions(): Question[] {
  ensureBank();
  return QUESTIONS;
}

export function questionsFor(kind: InterviewKind, level?: InterviewLevel): Question[] {
  ensureBank();
  return QUESTIONS.filter((q) => q.kind === kind && (!level || q.level === level));
}

export function findQuestion(id: string): Question | undefined {
  ensureBank();
  return QUESTIONS.find((q) => q.id === id);
}

/* ──────────────────────────────────────────────────────────────────────────
   Scoring
   ────────────────────────────────────────────────────────────────────────── */

export interface CriterionResult {
  id: string;
  label: string;
  met: boolean;
  weight: number;
}

export interface StageScore {
  score: number;
  maxScore: number;
  fraction: number;
  criteria: CriterionResult[];
  missed: string[];
  verdict: "strong" | "adequate" | "thin" | "missing";
}

/**
 * Score one answer against a stage's rubric.
 *
 * Deterministic by construction: the same answer always produces the same
 * score. An empty or near-empty answer scores 0 rather than being given
 * benefit of the doubt, because in a real interview it would be.
 */
export function scoreAnswer(stage: Stage, answer: string): StageScore {
  const text = answer.trim();
  const words = text.split(/\s+/).filter(Boolean).length;

  const criteria: CriterionResult[] = stage.criteria.map((c) => ({
    id: c.id,
    label: c.label,
    weight: c.weight,
    // A two-word answer cannot satisfy a criterion even if it contains the
    // keyword — that would reward keyword stuffing.
    met: words >= 4 && c.patterns.some((re) => re.test(text)),
  }));

  const maxScore = criteria.reduce((n, c) => n + c.weight, 0);
  const score = criteria.reduce((n, c) => n + (c.met ? c.weight : 0), 0);
  const fraction = maxScore > 0 ? score / maxScore : 0;

  const verdict: StageScore["verdict"] =
    words < 3 ? "missing" : fraction >= 0.75 ? "strong" : fraction >= 0.5 ? "adequate" : fraction >= 0.2 ? "thin" : "missing";

  return {
    score,
    maxScore,
    fraction,
    criteria,
    missed: criteria.filter((c) => !c.met).map((c) => c.label),
    verdict,
  };
}

/** A short, specific critique — names what was missed, never generic praise. */
export function feedbackFor(stage: Stage, result: StageScore): string {
  if (result.verdict === "missing") return stage.hint;
  if (result.missed.length === 0) {
    return "Complete answer. Every criterion covered — this is the level expected at this stage.";
  }
  const listed = result.missed.slice(0, 3).join("; ");
  const lead =
    result.verdict === "strong"
      ? "Strong answer with one gap:"
      : result.verdict === "adequate"
        ? "Covered the core, but missed:"
        : "Mostly incomplete. You did not address:";
  return `${lead} ${listed}. ${result.fraction < 0.6 ? stage.hint : ""}`.trim();
}

/** Aggregate a finished session. */
export function summarise(
  turns: { stage: string; fraction: number; verdict: string }[],
): { overall: number; weakest: string | null; text: string } {
  if (turns.length === 0) return { overall: 0, weakest: null, text: "No answers recorded." };
  const overall = turns.reduce((n, t) => n + t.fraction, 0) / turns.length;
  const weakest = [...turns].sort((a, b) => a.fraction - b.fraction)[0]?.stage ?? null;
  const pct = Math.round(overall * 100);
  const band =
    pct >= 80 ? "strong hire signal" : pct >= 60 ? "mixed, leaning positive" : pct >= 40 ? "below the bar as answered" : "not yet at the bar";
  return {
    overall,
    weakest,
    text: `${pct}% across ${turns.length} stages — ${band}. Weakest stage: ${weakest}. Re-read that stage's missed criteria; they are the highest-leverage thing to fix.`,
  };
}
