import { z } from "zod";

/**
 * A deck is one topic as a sequence of small cards. Text fields may contain
 * **bold**, $inline tex$ and {name} (replaced by the live value of a param or
 * derived quantity). Numbers come from `params` and `derived`, so every card
 * that shows a value stays consistent with the sliders.
 */
const Expr = z.string().min(1);
const Text = z.string().min(1);

const Param = z.object({ id: z.string().regex(/^[A-Za-z_]\w*$/), label: z.string(), min: z.number(), max: z.number(), step: z.number().default(0.1), init: z.number() });
const Derived = z.object({ id: z.string().regex(/^[A-Za-z_]\w*$/), expr: Expr });

const Color = z.string().default("#1cd6ac");

export const ChainView = z.object({
  type: z.literal("chain"),
  nodes: z.array(z.object({ label: z.string(), value: Expr, color: Color })).min(2),
  edges: z.array(z.object({ label: z.string().optional(), value: Expr.optional(), blame: Expr.optional(), blameAt: z.number().int().default(0) })),
}).refine((v) => v.edges.length === v.nodes.length - 1, "edges must be nodes - 1");
/** Arrows from the origin; x and y are expressions. */
const VectorsView = z.object({ type: z.literal("vectors"), range: z.number().default(5), arrows: z.array(z.object({ label: z.string(), x: Expr, y: Expr, color: Color })).min(1), xLabel: z.string().optional(), yLabel: z.string().optional() });
/** Plot of fn(t) with a marker at t = point and optional tangent of the given slope. */
const CurveView = z.object({ type: z.literal("curve"), fn: Expr, min: z.number(), max: z.number(), point: Expr, slope: Expr.optional(), yMin: z.number().optional(), yMax: z.number().optional(), xLabel: z.string().default("w"), yLabel: z.string().default("loss") });
/** Horizontal bars; `on` > 0 means the bar is active, otherwise dimmed. */
const BarsView = z.object({ type: z.literal("bars"), items: z.array(z.object({ label: z.string(), value: Expr, color: Color, on: Expr.optional() })).min(2), max: z.number().optional() });
/** Left-to-right pipeline of labelled stages with live notes. */
const FlowView = z.object({ type: z.literal("flow"), stages: z.array(z.object({ label: z.string(), note: Text, color: Color })).min(3) });
const Cell = z.union([z.string(), z.number()]).transform(String);
/** A row of cells with named pointers (index expressions) and highlighted windows. `note` is interpolated. */
const ArrayView = z.object({
  type: z.literal("array"), cells: z.array(Cell).min(1),
  // Optional replay of changing contents: cells shown are frames[pick(frame)] (all frames must have the same length).
  frames: z.array(z.array(Cell).min(1)).optional(), frame: Expr.optional(),
  pointers: z.array(z.object({ label: z.string(), at: Expr, color: Color })).default([]),
  windows: z.array(z.object({ from: Expr, to: Expr, color: Color })).default([]),
  note: Text.optional(),
});
/** Binary tree in heap layout (children of i are 2i+1 and 2i+2; null = empty). The first `step` indices of `order` are visited. */
const TreeView = z.object({ type: z.literal("tree"), values: z.array(z.union([Cell, z.null()])).min(1), order: z.array(z.number().int().min(0)).default([]), step: Expr.default("0"), note: Text.optional() });
/** Graph on a 0-100 canvas. The first `step` entries of `order` are visited; `from` draws the edge that reached the node. */
const GraphView = z.object({
  type: z.literal("graph"),
  nodes: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })).min(2),
  edges: z.array(z.object({ a: z.string(), b: z.string(), w: Cell.optional() })).default([]),
  directed: z.boolean().default(false),
  order: z.array(z.object({ node: z.string(), from: z.string().optional(), label: Cell.optional() })).default([]),
  step: Expr.default("0"), note: Text.optional(),
});
/** A table that fills row by row; the first `fill` cells (row-major) are shown, the last one highlighted. */
const GridView = z.object({ type: z.literal("grid"), rows: z.array(z.array(Cell).min(1)).min(1), rowLabels: z.array(Cell).optional(), colLabels: z.array(Cell).optional(), fill: Expr, note: Text.optional() });
export const View = z.discriminatedUnion("type", [ChainView, VectorsView, CurveView, BarsView, FlowView, ArrayView, TreeView, GraphView, GridView]);

const Base = { kicker: z.string(), title: z.string() };

export const Card = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("story"), ...Base, body: z.array(Text).min(1), callout: Text.optional() }),
  z.object({
    kind: z.literal("lab"), ...Base, intro: Text, view: View, also: View.optional(), sliders: z.array(z.string()).default([]),
    showBlame: z.boolean().default(false), outro: Text.optional(),
    // Narration that follows a slider: says[pick(saysAt)] is shown under the picture.
    says: z.array(Text).default([]), saysAt: Expr.optional(),
    action: z.object({ label: Text, set: z.record(z.string(), Expr), track: z.string(), rate: z.string().optional(), hint: Text.optional() }).optional(),
  }),
  z.object({
    kind: z.literal("formula"), ...Base, tex: z.string(), say: Text,
    symbols: z.array(z.object({ tex: z.string(), means: Text, value: Expr.optional() })).min(1),
    // Hand-computed answers: `expr` is evaluated at the starting values and must equal `equals`.
    verify: z.array(z.object({ expr: Expr, equals: z.number(), tol: z.number().default(0.01) })).default([]),
  }),
  z.object({
    kind: z.literal("reveal"), ...Base, intro: Text, view: ChainView,
    steps: z.array(z.object({ tex: z.string(), says: Text, value: Text })).min(2), outro: Text.optional(),
  }),
  z.object({
    kind: z.literal("check"), ...Base, question: Text,
    options: z.array(z.object({ text: Text, correct: z.boolean().default(false), why: Text })).min(2),
  }),
  z.object({ kind: z.literal("code"), ...Base, intro: Text, lang: z.string(), code: z.string(), note: Text.optional() }),
  // A task the learner solves in an editor; `tests` run in the sandbox. `solution` is revealed on request and is run by tests/decks.test.ts.
  z.object({
    kind: z.literal("practice"), ...Base, intro: Text, entry: z.string().regex(/^[A-Za-z_]\w*$/), starter: z.string(), solution: z.string(),
    tests: z.array(z.object({ input: z.string(), expected: z.string() })).min(2), hint: Text.optional(),
  }),
  z.object({ kind: z.literal("mistakes"), ...Base, items: z.array(Text).min(1), next: z.object({ label: z.string(), href: z.string() }).optional() }),
]);
export type Card = z.infer<typeof Card>;
export type ChainViewT = z.infer<typeof ChainView>;
export type ViewT = z.infer<typeof View>;

export const Deck = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  minutes: z.number().int().positive(),
  order: z.number().int().default(99),
  params: z.array(Param).default([]),
  derived: z.array(Derived).default([]),
  cards: z.array(Card).min(3),
});
export type Deck = z.infer<typeof Deck>;
