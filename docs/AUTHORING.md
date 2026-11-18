# Topic Authoring Guide

Every topic in this corpus is a YAML file at
`content/tracks/<track-slug>/topics/<topic-id>.yaml`.

The gate is `npm run content:validate`. It checks the schema, resolves every
cross-reference, requires a complete five-tier hint ladder, and **executes
every reference solution against its own test cases**. A topic that parses but
computes the wrong answer fails the build.

---

## 1. The shape of a good topic

The reference app's corpus works because its pedagogy is *structured*, not because it is
long. Mirror that. A topic has these parts, in this order:

```yaml
id: <slug>                       # matches the syllabus id exactly
slug: <slug>
title: "..."
summary: >-                      # 1–2 sentences: what the learner can DO after
  ...                             #   this topic. Present tense, concrete.
kind: lesson                     # lesson | lecture | problem | case_study | interview | lab | reference
difficulty: medium               # intro | easy | medium | hard | expert
position: 1                      # from the syllabus
estMinutes: 45
prerequisites: [other-topic-id]  # from the syllabus; MUST be earlier in the track
phase: "<track phase name>"
tags: [linear-algebra, pca]

body:
  big_idea: >-                  # ONE sentence. The idea the topic is about.
  problem:                       # 3–5 bullets: why should I care?
    - "..."
  analogy: |                     # A plain-language analogy, 3–6 lines.
  concept_points:                # 6–12 bullets: the actual teaching. Each one is
    - "..."                      #   a COMPLETE explanation, not a label.
  definitions:                   # 5–10 glossary entries.
    - { term: "PCA", meaning: "..." }
  diagrams:                      # 3–6 structured, interactive diagrams.
    - { type: compare, ... }
  markdown: |                    # Long-form prose with LaTeX. 600–1200 words.
  derivations:                   # 2–5 worked mathematical steps.
  implementations:               # 1–3 from-scratch code blocks.
  checkpoints:                   # 3–6 self-check questions.
  hints:                         # Exactly 5 tiers.
  problems:                      # 2–4 problems with tested reference solutions.
  visualizers:                   # Optional interactive computational visuals.
```

### Quality bars, concretely

| Field | Bar |
|---|---|
| `big_idea` | One sentence a learner could repeat to a colleague. Not a topic label. |
| `problem` | Each bullet starts from their situation, not from the mathematics. |
| `analogy` | A real analogy with a real mapping — state where it breaks down. |
| `concept_points` | **The heart of the topic.** 6–12 bullets. Each one: what it is, why it matters, a concrete number or example, and the trap. If a bullet could be a section title, it is not a concept point. |
| `definitions` | Terms a practitioner actually uses, with the meaning you'd need to explain it to a teammate. |
| `markdown` | Where the *math* lives. Use `$$…$$` for display math and `$…$` inline. Tables beat prose for comparisons. |
| `derivations` | Each has a `title`, `latex`, and a `prose` sentence that makes the equation *mean* something. Never dump an equation without its meaning. |
| `implementations` | `note` must say when the implementation is **numerically wrong**, not just what it does. |
| `checkpoints` | `question` + `hint` (a smaller reveal) + `solution` (full reasoning). |
| `hints` | Exactly five tiers, in order. See below. |
| `problems` | Every `solution` must pass its own `testCases`. No exceptions. |

---

## 2. The five-tier hint ladder

| Tier | Key | The learner gets |
|---|---|---|
| 1 | `concept` | What is actually going on. No formulas that give the answer. |
| 2 | `direction` | Which technique to reach for, and why that one over the alternatives. |
| 3 | `pseudocode` | The shape of the solution, without syntax. |
| 4 | `derivation` | The mathematics, worked out line by line. |
| 5 | `solution` | A complete reference implementation with an explanation. |

Each tier has `content`, optional `blocks[]`, and a `checkpoint` — a question
that makes the learner stop and think rather than scroll on.

`blocks[]` kinds: `pseudocode`, `math`, `code`, `checklist`, `warning`,
`diagram`. A `checklist` block is a bulleted decision aid. A `warning` block
is a "this is where people go wrong" note. A `diagram` block carries a
structured diagram inline.

**Tier 1 must not contain the answer.** A learner who reads tier 1 and
immediately knows the solution has learned nothing, and the ladder has
failed.

---

## 3. Diagrams

Ten structured types, all rendered as interactive components:

| Type | Use it for | Shape |
|---|---|---|
| `architecture` | System designs, model pipelines, serving stacks | `nodes[{id,x,y,label,kind,detail}]` + `edges[{from,to,label?,style?}]` |
| `compare` | X vs Y, old vs new, one approach vs another | `left_label/left_points[]/right_label/right_points[]` |
| `pipeline` | Ordered steps in a process | `nodes[{label,note?,detail?}]` |
| `stack` | Layered protocols, memory hierarchies, abstractions | `layers[]` |
| `graph` | Relationship graphs | `nodes[{id,label}]` + `edges[{from,to,label?}]` |
| `cycle` | Repeating loops | `steps[]` |
| `sequence` | Ordered events | `items[]` |
| `mermaid` | Anything Mermaid does better | `code` (Mermaid syntax) |
| `plot` | A chart | `chart: line\|bar\|scatter\|area` + `series[{name,points[{x,y}]}]` |
| `circuit` | Schematics | `components[]` + `connections[]` |

`architecture` node `kind` is one of: `client`, `load_balancer`, `server`,
`database`, `cache`, `worker`, `queue`, `external`, `model`, `gpu`, `storage`.

For `architecture`, place nodes on a grid: `x` is the column, `y` is the row.
Put `detail:` on any node that deserves explanation — it is revealed when the
learner clicks it.

**Keep an architecture diagram to four columns or fewer.** The reading pane is
roughly 550px wide, so a wider graph either shrinks its node text below
legibility or forces horizontal scrolling. If you need more stages, use two
rows (a serpentine layout) rather than a longer row.

Edge labels on adjacent columns are lifted above the node row automatically, so
label them generously — the renderer will place them without collision.

**Every diagram must earn its place.** A diagram that restates the prose is
noise. Use `architecture` when the reader needs to see *where something lives*
and *what talks to what*; use `compare` when the reader needs to *choose*.

---

## 4. Problems and the executable gate

```yaml
problems:
  - id: p-<slug>
    title: "..."
    difficulty: medium
    prompt: >-
      What the learner must produce.
    starter: |
      def solve(x):
          # your implementation here
          pass
    language: python
    entry: solve                    # the function the harness calls
    testCases:
      - input: "[[1.0, 2.0], [3.0, 4.0]]"
        expected: "..."
        mode: json
        tolerance: 0.000001          # ALWAYS set this for float answers
    solution: |
      def solve(x):
          ...
    solutionExplanation: >-
      Why this is correct.
    complexity: "O(n log n)"
    tags: [sorting]
```

The harness:
- `input` is a JSON string. If it parses to a dict, it is called with
  `**input`; otherwise `*input`.
- `entry` names the function to call.
- `mode: json` compares with numeric tolerance; `mode: exact` compares raw
  strings.
- `tolerance` is relative to `max(1, |expected|, |actual|)`. **Set it
  explicitly on every float case** — exact float equality fails for the
  wrong reason.
- `expected` is a JSON-encoded value.

**Check your expected values by hand before trusting them.** The validator
will catch a wrong one, but it is faster to compute it yourself.

---

## 5. Math conventions

- Inline: `$...$`. Display: `$$...$$`.
- A **single newline** inside inline math is fine. A **blank line** is not.
- Code spans and fenced blocks are protected — `$` inside them is literal.
- Use `\operatorname{}` for named operators, `\text{}` for words in equations.
- Write `\|v\|` for a norm, not `||v||` (the pipes are table syntax in some
  Markdown parsers).

---

## 6. The chain rule: prerequisites are not decorative

A topic's prerequisites come from `content/syllabus.yaml`. The validator
enforces that they resolve, that the graph is acyclic, and that they appear
*earlier* in the track.

**Use them.** If a topic lists `matrix-calculus` as a prerequisite, the
lesson must actually build on it — reference the Jacobian or the chain rule
explicitly, and say "this is the same operation you did in *Matrix
Calculus*, applied to a different object."

The learner must never have to learn something in Track 4 that Track 0
already taught. When you need a concept that is not yet introduced, either
(a) it should have been a prerequisite — flag it in the topic's `notes` for
the maintainer, or (b) introduce it inline with a pointer back.

---

## 7. Before you submit

```bash
npm run content:validate
```

It must report your topic as valid and your reference solutions as passing.
If it fails, fix it — do not weaken the test to make it pass.

---

## 8. A note on voice

Write for someone who is smart, busy, and wants to be able to *do* the
thing. Not for someone who needs to be impressed.

- Prefer the concrete number over the abstraction: "‖A‖₂ = 4.2" beats "‖A‖₂ is
  moderately large".
- Say what breaks and why. A topic that only describes the happy path is
  half a topic.
- No filler openers. Do not write "In this lesson we will explore…". Start
  with the problem.
- Do not hedge into uselessness. Be direct about which approach is right and
  why.

## LaTeX escaping: one rule, and why it bites

**Block scalars (`|`, `>`) do not process escapes. Double-quoted scalars do.**

| You want KaTeX to see | In a block scalar write | In a double-quoted scalar write |
|---|---|---|
| `\sigma` | `\sigma` | `\\sigma` |
| `\\` (matrix row break) | `\\` | `\\\\` |

Getting this wrong is unusually dangerous because it **renders successfully**:
KaTeX reads `\\` as a line break, so `\\sigma` typesets as a newline followed by
the literal word "sigma". You get valid HTML, a non-zero KaTeX count, and a
wrong equation.

`npm run content:validate` prints a `⚠` for every field whose *parsed* value
still contains a doubled backslash. The renderer normalises `\\` + letter back
to `\` + letter, so learners see the right thing — but write it correctly at
source, because the warning is counting a real authoring error.

Prefer block scalars for anything with more than a couple of inline symbols;
you then write LaTeX exactly as you would in a `.tex` file.
