import { z } from "zod";

/**
 * Content schemas.
 *
 * The shape is modelled on the reference app's corpus, which is what makes that corpus
 * good: the pedagogy is in the *structure* (a one-sentence `big_idea`, a
 * plain-language `analogy`, discrete `concept_points`, term/meaning
 * `definitions`), not in one long markdown blob. The reference app's lessons answer
 * "why should I care?" before "what is it?", and they back that with
 * structured diagrams rather than decoration.
 *
 * Sigma keeps that structure and adds three things the reference app lacked:
 *   1. a five-tier hint ladder with server-side gating,
 *   2. worked mathematical derivations,
 *   3. from-scratch implementations whose reference solutions are EXECUTED
 *      by the build gate rather than merely parsed.
 *
 * One schema module, shared by the runtime loader and the build-time
 * validator, so they cannot drift.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Diagrams
// ─────────────────────────────────────────────────────────────────────────────

/** A node in a positioned architecture diagram. */
export const ArchNodeSchema = z.object({
  id: z.string(),
  /** Grid column. */
  x: z.number().int().default(0),
  /** Grid row. */
  y: z.number().int().default(0),
  label: z.string(),
  /** Visual category — drives the icon, colour and shape. */
  kind: z
    .enum([
      "client",
      "load_balancer",
      "server",
      "database",
      "cache",
      "worker",
      "queue",
      "external",
      "model",
      "gpu",
      "storage",
    ])
    .default("server"),
  /** Optional detail revealed when the node is selected. */
  detail: z.string().optional(),
});

export const ArchEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  /** `async` draws a dashed edge; `bidirectional` draws two heads. */
  style: z.enum(["solid", "async", "bidirectional"]).default("solid"),
});

export const CompareDiagramSchema = z.object({
  type: z.literal("compare"),
  title: z.string().optional(),
  left_label: z.string(),
  left_points: z.array(z.string()).default([]),
  right_label: z.string(),
  right_points: z.array(z.string()).default([]),
});

export const PipelineDiagramSchema = z.object({
  type: z.literal("pipeline"),
  title: z.string().optional(),
  nodes: z
    .array(
      z.object({
        label: z.string(),
        note: z.string().optional(),
        detail: z.string().optional(),
      }),
    )
    .min(1),
});

export const StackDiagramSchema = z.object({
  type: z.literal("stack"),
  title: z.string().optional(),
  layers: z.array(z.string()).min(1),
  /** Rendered bottom-to-top instead of top-to-bottom. */
  reversed: z.boolean().default(false),
});

export const GraphDiagramSchema = z.object({
  type: z.literal("graph"),
  title: z.string().optional(),
  nodes: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      }),
    )
    .default([]),
});

export const CycleDiagramSchema = z.object({
  type: z.literal("cycle"),
  title: z.string().optional(),
  steps: z.array(z.string()).min(2),
});

export const SequenceDiagramSchema = z.object({
  type: z.literal("sequence"),
  title: z.string().optional(),
  items: z.array(z.string()).min(1),
});

export const MermaidDiagramSchema = z.object({
  type: z.literal("mermaid"),
  title: z.string().optional(),
  code: z.string().min(1),
});

export const CircuitDiagramSchema = z.object({
  type: z.literal("circuit"),
  title: z.string().optional(),
  components: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        kind: z.enum(["source", "resistor", "capacitor", "led", "switch", "ic", "wire"]).default("ic"),
        value: z.string().optional(),
      }),
    )
    .default([]),
  connections: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
});

/** A chart embedded in a lesson. */
export const PlotDiagramSchema = z.object({
  type: z.literal("plot"),
  title: z.string().optional(),
  /** `line` | `bar` | `scatter` | `area`. */
  chart: z.enum(["line", "bar", "scatter", "area"]).default("line"),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  series: z
    .array(
      z.object({
        name: z.string(),
        points: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
      }),
    )
    .min(1),
});

export const ArchitectureDiagramSchema = z.object({
  type: z.literal("architecture"),
  title: z.string().optional(),
  nodes: z.array(ArchNodeSchema).min(1),
  edges: z.array(ArchEdgeSchema).default([]),
  /** Extra prose shown under the diagram. */
  caption: z.string().optional(),
});

export const DiagramSchema = z.discriminatedUnion("type", [
  ArchitectureDiagramSchema,
  CompareDiagramSchema,
  PipelineDiagramSchema,
  StackDiagramSchema,
  GraphDiagramSchema,
  CycleDiagramSchema,
  SequenceDiagramSchema,
  MermaidDiagramSchema,
  CircuitDiagramSchema,
  PlotDiagramSchema,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Topic body
// ─────────────────────────────────────────────────────────────────────────────

export const TestCaseSchema = z.object({
  input: z.string(),
  expected: z.string().optional(),
  mode: z.enum(["json", "exact"]).optional(),
  /** Relative/absolute tolerance for numeric comparison. Defaults to 1e-9. */
  tolerance: z.number().positive().optional(),
});

export const CodeBlockSchema = z.object({
  language: z.string(),
  title: z.string().optional(),
  code: z.string(),
  /** Optional explanation rendered under the block. */
  note: z.string().optional(),
});

export const DerivationStepSchema = z.object({
  title: z.string(),
  /** LaTeX, rendered by KaTeX. */
  latex: z.string().optional(),
  prose: z.string().optional(),
});

export const CheckpointSchema = z.object({
  id: z.string(),
  question: z.string(),
  /** Answer shape, for self-check grading. */
  answerKind: z.enum(["short_text", "code", "multiple_choice"]).default("short_text"),
  choices: z.array(z.string()).optional(),
  solution: z.string().optional(),
  hint: z.string().optional(),
});

export const VisualizerSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "tensor",
    "attention",
    "loss_surface",
    "computation_graph",
    "shape_flow",
    "tokenizer",
  ]),
  title: z.string(),
  description: z.string().optional(),
  /** Parameters that configure the visualizer. */
  params: z.record(z.string(), z.unknown()).default({}),
});

export const HintBlockSchema = z.object({
  kind: z.enum(["pseudocode", "math", "code", "checklist", "warning", "diagram"]),
  language: z.string().optional(),
  body: z.string(),
  /** For `kind: diagram`, an inline structured diagram. */
  diagram: z.unknown().optional(),
});

/** One rung of the five-tier hint ladder. */
export const HintSchema = z.object({
  tier: z.number().int().min(1).max(5),
  /** Optional short key, e.g. "concept", "direction". */
  key: z.string().optional(),
  title: z.string().optional(),
  content: z.string(),
  blocks: z.array(HintBlockSchema).default([]),
  checkpoint: z.string().optional(),
});

export const ProblemSchema = z.object({
  id: z.string(),
  title: z.string(),
  difficulty: z.enum(["intro", "easy", "medium", "hard", "expert"]).default("medium"),
  /** What the learner must produce. */
  prompt: z.string(),
  /** A starter snippet in the target language. */
  starter: z.string().optional(),
  language: z.string().default("python"),
  /** Function name the sandbox harness should call. */
  entry: z.string().default("solve"),
  testCases: z.array(TestCaseSchema).default([]),
  /** Reference solution, revealed only at tier 5. */
  solution: z.string().optional(),
  solutionExplanation: z.string().optional(),
  complexity: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const DefinitionSchema = z.object({
  term: z.string(),
  meaning: z.string(),
});

/**
 * An interview question attached to a topic.
 *
 * `key_points` is the rubric: what a strong answer must contain. The interview
 * engine scores against these, and the lesson renders them only after the
 * learner has attempted an answer — a visible rubric is a reading exercise, a
 * hidden one is a test.
 */
export const InterviewQuestionSchema = z.object({
  question: z.string(),
  key_points: z.array(z.string()).default([]),
  /** The probe that follows a good answer. */
  follow_up: z.string().optional(),
  level: z.enum(["junior", "mid", "senior", "staff"]).default("mid"),
  /** Optional reference answer, revealed on request. */
  model_answer: z.string().optional(),
});

export const FurtherReadingSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
});

export const TopicBodySchema = z.object({
  // ── The reference app-style structured pedagogy ───────────────────────────────
  /** One sentence that states the idea the whole topic is about. */
  big_idea: z.string().optional(),
  /** Why this topic matters, in the learner's terms. */
  problem: z.array(z.string()).default([]),
  /** A plain-language analogy for the core idea. */
  analogy: z.string().optional(),
  /** The discrete teaching points. Each is a complete explanation. */
  concept_points: z.array(z.string()).default([]),
  /** Glossary entries. */
  definitions: z.array(DefinitionSchema).default([]),
  /** Structured, interactive diagrams. */
  diagrams: z.array(DiagramSchema).default([]),

  // ── The loop (the reference app parity: every teaching unit ends in production) ──
  /**
   * A 2–3 sentence micro-exercise the learner does *now*, not later.
   * The whole point of the field is that the page cannot be finished passively.
   */
  try_it: z.string().optional(),
  /** The interview questions this topic prepares you to answer. */
  interview_questions: z.array(InterviewQuestionSchema).default([]),
  /** Traps interviewers use to filter candidates. */
  common_mistakes: z.array(z.string()).default([]),
  /** Where to go next. */
  further_reading: z.array(FurtherReadingSchema).default([]),

  // ── System-design contract (track 07) ──────────────────────────────
  // A case study in this track is not a lesson with a diagram: it is a
  // decision record. These fields are the ones an interviewer probes, and
  // they are what the review's §C contract requires.
  problem_statement: z.string().optional(),
  requirements: z
    .object({
      functional: z.array(z.string()).default([]),
      non_functional: z.array(z.string()).default([]),
    })
    .optional(),
  clarifying_questions: z
    .array(z.object({ question: z.string(), why_it_matters: z.string() }))
    .default([]),
  capacity_estimation: z
    .object({
      assumptions: z.array(z.string()).default([]),
      arithmetic: z
        .array(
          z.object({
            label: z.string(),
            calculation: z.string(),
            conclusion: z.string(),
          }),
        )
        .default([]),
    })
    .optional(),
  architecture_summary: z.string().optional(),
  deep_dives: z
    .array(
      z.object({
        topic: z.string(),
        explanation: z.string(),
        tradeoffs: z
          .array(z.object({ option: z.string(), pros: z.string(), cons: z.string() }))
          .default([]),
      }),
    )
    .default([]),
  bottlenecks: z
    .array(z.object({ failure: z.string(), symptom: z.string(), mitigation: z.string() }))
    .default([]),
  what_to_steal: z.array(z.string()).default([]),

  // ── Long-form material ─────────────────────────────────────────────
  /** Opening summary shown above the lesson. */
  summary: z.string().optional(),
  /** The lesson prose. Supports $$…$$ math. */
  markdown: z.string().default(""),
  /** Worked derivations, one per mathematical step. */
  derivations: z.array(DerivationStepSchema).default([]),
  /** From-scratch implementations. */
  implementations: z.array(CodeBlockSchema).default([]),
  /** Self-check questions. */
  checkpoints: z.array(CheckpointSchema).default([]),
  /** Interactive computational visualizers attached to this topic. */
  visualizers: z.array(VisualizerSchema).default([]),
  /** The hint ladder for this topic, tier by tier. */
  hints: z.array(HintSchema).default([]),
  /** Interview-style problems attached to this topic. */
  problems: z.array(ProblemSchema).default([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Topic
// ─────────────────────────────────────────────────────────────────────────────

export const TopicKindSchema = z.enum([
  "lesson",
  "lecture",
  "problem",
  "case_study",
  "interview",
  "lab",
  "reference",
]);

export const TopicSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: TopicKindSchema.default("lesson"),
  difficulty: z.enum(["intro", "easy", "medium", "hard", "expert"]).default("medium"),
  position: z.number().int().default(0),
  estMinutes: z.number().int().default(30),
  prerequisites: z.array(z.string()).default([]),
  /** Phase within the track, used for ordering and roadmap views. */
  phase: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** For case studies: the companies being imitated. */
  companies: z.array(z.string()).optional(),
  body: TopicBodySchema,
  /** Assigned by the loader from the containing directory. */
  trackId: z.string().optional(),
});

export const TrackSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  tier: z.number().int().min(0).max(5).default(0),
  color: z.string().default("#1cd6ac"),
  sortOrder: z.number().int().default(0),
  /** What a learner can do after finishing this track. */
  outcomes: z.array(z.string()).default([]),
});

export const ContentFileSchema = z.object({
  track: TrackSchema.optional(),
  topics: z.array(TopicSchema).default([]),
});

/**
 * A short-form card: a real-world case study or a practical playbook.
 *
 * Deliberately not a Topic. A topic is a 1,200-word lesson with derivations and
 * problems; this is a five-minute brief a learner can scan, repeat, and act on.
 * The reference app's own corpus separates these — its lessons average 212 words and its
 * case studies 288, against which a single 1,200-word essay per subject is a
 * book rather than a curriculum.
 */
export const CaseStudySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: z.enum(["case_study", "playbook"]).default("case_study"),
  /** ISO date of the event or the snapshot the card describes. */
  date: z.string().optional(),
  actors: z.array(z.string()).default([]),
  /** The version a learner should be able to repeat from memory. */
  key_facts: z.array(z.string()).default([]),
  timeline: z
    .array(
      z.object({
        // A bare year in YAML parses as a number, so coerce rather than
        // forcing every author to remember the quotes.
        when: z.union([z.string(), z.number()]).transform(String),
        what: z.string(),
      }),
    )
    .default([]),
  decisions: z
    .array(z.object({ choice: z.string(), why: z.string(), cost: z.string() }))
    .default([]),
  lessons: z.array(z.string()).default([]),
  steps: z
    .array(z.object({ step: z.string(), detail: z.string() }))
    .default([]),
  mistakes: z.array(z.string()).default([]),

  // ── Deep case-study contract ───────────────────────────────────────
  // A 600-word note is a blog post. A case study is a decision record with
  // arithmetic: the constraint, the alternatives rejected, the numbers that
  // chose between them, and the failure mode that appears at 10x scale.
  // These fields are optional so short playbooks stay valid, but a document
  // that carries `capacity_estimation` is the standard the review demands.
  problem_statement: z.string().optional(),
  requirements: z
    .object({
      functional: z.array(z.string()).default([]),
      non_functional: z.array(z.string()).default([]),
    })
    .optional(),
  clarifying_questions: z
    .array(z.object({ question: z.string(), why_it_matters: z.string() }))
    .default([]),
  capacity_estimation: z
    .object({
      assumptions: z.array(z.string()).default([]),
      arithmetic: z
        .array(
          z.object({
            label: z.string(),
            calculation: z.string(),
            conclusion: z.string(),
          }),
        )
        .default([]),
    })
    .optional(),
  architecture_summary: z.string().optional(),
  deep_dives: z
    .array(
      z.object({
        topic: z.string(),
        explanation: z.string(),
        tradeoffs: z
          .array(z.object({ option: z.string(), pros: z.string(), cons: z.string() }))
          .default([]),
      }),
    )
    .default([]),
  bottlenecks: z
    .array(z.object({ failure: z.string(), symptom: z.string(), mitigation: z.string() }))
    .default([]),
  interview_questions: z.array(InterviewQuestionSchema).default([]),
  what_to_steal: z.array(z.string()).default([]),
  further_reading: z.array(FurtherReadingSchema).default([]),

  sources: z
    .array(z.object({ label: z.string(), url: z.string().optional() }))
    .default([]),
  tags: z.array(z.string()).default([]),
});

/**
 * A staged mock-interview question, authored as content.
 *
 * `patterns` are regex sources compiled by the deterministic rubric matcher in
 * `src/lib/interview/engine.ts`. The engine never uses a model to produce a
 * score — it matches coverage and reports what was missed, so the same answer
 * always scores the same.
 */
export const InterviewBankSchema = z.object({
  id: z.string(),
  kind: z.enum(["system_design", "coding", "behavioral", "ml_system"]),
  level: z.enum(["junior", "mid", "senior", "staff", "principal"]).default("mid"),
  title: z.string(),
  prompt: z.string(),
  reference_topics: z.array(z.string()).default([]),
  stages: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        intent: z.string(),
        hint: z.string().default(""),
        criteria: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            weight: z.number().positive().default(1),
            patterns: z.array(z.string()).min(1),
          }),
        ),
      }),
    )
    .min(1),
});

export type InterviewBankItem = z.infer<typeof InterviewBankSchema>;

export type Topic = z.infer<typeof TopicSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Problem = z.infer<typeof ProblemSchema>;
export type TopicBody = z.infer<typeof TopicBodySchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type Visualizer = z.infer<typeof VisualizerSchema>;
export type CaseStudy = z.infer<typeof CaseStudySchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type Diagram = z.infer<typeof DiagramSchema>;
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;
export type FurtherReading = z.infer<typeof FurtherReadingSchema>;
export type ArchNode = z.infer<typeof ArchNodeSchema>;
export type ArchEdge = z.infer<typeof ArchEdgeSchema>;
export type CompareDiagram = z.infer<typeof CompareDiagramSchema>;
export type PipelineDiagram = z.infer<typeof PipelineDiagramSchema>;
export type StackDiagram = z.infer<typeof StackDiagramSchema>;
export type GraphDiagram = z.infer<typeof GraphDiagramSchema>;
export type CycleDiagram = z.infer<typeof CycleDiagramSchema>;
export type SequenceDiagram = z.infer<typeof SequenceDiagramSchema>;
export type MermaidDiagram = z.infer<typeof MermaidDiagramSchema>;
export type CircuitDiagram = z.infer<typeof CircuitDiagramSchema>;
export type PlotDiagram = z.infer<typeof PlotDiagramSchema>;
export type ArchitectureDiagram = z.infer<typeof ArchitectureDiagramSchema>;
