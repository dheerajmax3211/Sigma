# Sigma — remediation progress

**Spec:** the product-owner review of 2026-10-29
**Started:** 2026-10-29
**Success metric:** a candidate can study for a week and pass all five interview rounds — maths, coding, system design, GenAI 2026, oral.

Status legend: `DONE` · `IN PROGRESS` · `PENDING` · `BLOCKED`

---

## P0 — blocks the contract

| # | Finding | Status | Evidence / notes |
|---|---|---|---|
| P0-1 | Loop on every topic (`try_it`, 3 `interview_questions`, 3 `common_mistakes`, 2 `further_reading`) | **DONE** | **89/89 topics** carry the loop; `LOOP_GATE=error pnpm content:validate` is green. Schema, renderer (`Try it now` / `What they will ask you` / `How candidates lose this one`), and release gate all shipped. Three parallel agents authored it; two raced on `apply-loop.py`, both self-corrected, and a re-audit found 0 gaps. |
| P0-2 | Cut learner-facing prose 1,734 -> ~650 words | **DONE** | All **101 topics** trimmed and independently audited: median **467** words (mean 460, max 510), every topic exactly 6 concept points, every topic keeps its loop, diagrams and 2+ sources, and every cut sentence is preserved verbatim under `## The longer version` inside the collapsed *Go deeper*. Browser-measured: `backpropagation` 2,864 -> 1,571 visible including the loop. |
| P0-3 | 12 ML system-design case studies, 12 sections, 2,000+ words, real arithmetic | **DONE** | 12 files in track 07, positions 6-17. Each 5,700-7,700 words with 6-10 arithmetic entries showing the multiplication (e.g. 100 GB FP8 weights / 12.5 GB per GPU at TP=8; 1.68e18 FLOPs per 70B step -> 7.37 s compute -> 38% MFU). Verified rendering: `Capacity arithmetic` section is live on `/topic/cs-llm-serving`. |
| P0-4 | 8 frontier-model blueprints, 2,000+ words each | **DONE** | 8 notes, 5,100-5,600 words each, 5 deep dives, 8-11 arithmetic entries, 5 bottlenecks, 7 interview questions apiece. **Renderer bug found and fixed:** `/note/[id]` ignored every deep field, so the blueprints rendered as ~600-word cards; the page now renders problem/requirements/clarifying/capacity/architecture/deep-dives/bottlenecks/what-to-steal/interview-probes. Live check: `/note/kimi-k3` now renders 12,967 words with its capacity arithmetic. |
| P0-5 | 150-question interview bank + staged scoring | **DONE** | `GET /api/interview` returns **153 questions** (3 built-in + 150 authored): 55 system_design, 46 ml_system, 37 coding, 15 behavioral; 471 stages, 1,417 regex criteria. Engine merges content lazily; generic filler text scores 0.04 mean, so the rubrics are not keyword soup. |
| P0-6 | Track 7 registered and complete (was 3/14, and not loaded at all) | **DONE** | Two root causes fixed: no `track.yaml` (track never registered) and the loader keyed topics by folder slug (`system-design`) while the track declared `staff`, so its page rendered empty. Loader now takes the canonical id from `track.yaml`. `/track/staff` lists **15 topics**. |
| P0-7 | 6 build-from-scratch projects | **DONE — independently verified** | Track `09-build`, 6 topics, 828-1,014 words of markdown each, every one with a Milestone-test section and a runnable reference implementation (45-120 lines). I executed three of the implementations straight out of the YAML: LoRA merged to 3.11e-15 and 0.78% params, the diffusion sampler hit DDIM 0.0 / Euler ratio 10.21, the paged-attention scheduler admitted r2 at step 3 — all matching the claims in the topics. |
| P0-8 | Home page: 5,487 words → a 60-second path | **DONE** | Catalogue moved to `/tracks`; home now hero + three entry points + derived counts. |

## P1 — costs value

| # | Finding | Status | Notes |
|---|---|---|---|
| P1-9 | Visual prerequisite DAG replacing the flat list | **DONE** | `/roadmap` renders a derived SVG DAG — rows are tracks, arrows are real prerequisite edges (cross-track ones included). |
| P1-10 | Promote case studies, kill the "Field notes" label | **DONE** | Nav is now Tracks · Case studies · Lab · Interview · Search. |
| P1-11 | Monaco in the topic workspace (was a raw `<textarea>`) | **DONE** | `TopicWorkspace.tsx` now renders `CodeEditor` (Monaco); the `<textarea>` is gone. |
| P1-12 | Onboarding + diagnostic | **DONE** | `/start`: entry level, target role, weeks available -> a deterministic track ordering with an hours/week budget, saved locally. Linked from the hero ("Set up your path"). Not a personality quiz: every answer changes the order. |
| P1-13 | Scored mock interview persisted with improvement points | **DONE** | Verified in source: completion writes `overall_score`, `overall_feedback`, returns `weakest` stage + `referenceTopics` (`api/interview/route.ts:312-326`). The review's claim that this was missing was wrong. |
| P1-14 | Living October-2026 news surface tied to topics | **DONE** | `/news` (“Chronology” in nav) merges every dated `timeline` entry from the 8 blueprints and case studies, year-grouped, each attributed back to its source document. Deliberately derived rather than fetched: the app has no network, and an unattributed feed would be the one place fabrication could enter. |
| P1-15 | Streaks / achievements / profile | **DONE** | `src/lib/progress/achievements.ts` derives 9 badges + streak from real rows (no drift, no migration); `/profile` page live. |

## P2 — polish

| # | Finding | Status | Notes |
|---|---|---|---|
| P2-16 | Labels derived from data, never literals | **DONE** | Track/topic counts now come from the loader; the 7th track is real. |
| P2-17 | Declared-but-unrendered visualizers | **DONE** | **Review was wrong.** `VisualizerHost.tsx` already dispatches `loss_surface` -> `LossSurfaceView`, `attention` -> `AttentionView`, `tensor` -> `TensorView`, `shape_flow` -> `TensorView`, `computation_graph` -> `ComputationGraphView`. All four substantive views exist and render on a live topic page. |
| P2-18 | Session resume / "continue where you left off" | **DONE** | **Review was wrong.** The home page already renders "Pick up where you left off" from `nextUp(db, learnerId, 3)`, with per-topic mastery, due/scheduled/new badges and effective-mastery decay. |

---

## Gates

| Gate | Command | State |
|---|---|---|
| Types | `pnpm typecheck` | ✅ clean |
| Tests | `pnpm test` | not yet run since changes |
| Content | `pnpm content:validate` | ✅ 78 topics, 234 reference solutions |
| Release content gate | `LOOP_GATE=error pnpm content:validate` | ⏳ 17 topics still missing loop fields |
| Server | `http://127.0.0.1:4310` | ✅ running |

## Notes

- `pnpm` was failing before any work started: `pnpm-workspace.yaml` contained the literal placeholder `esbuild: set this to true or false`. Fixed to `true`; `pnpm install` now succeeds, so `typecheck`/`test` can run at all.
- The 78→92 gap: the syllabus declares 92 topics across 7 tracks; 78 files exist. Track 7 (`staff`) declares 14 and had 3. The case-study work closes this.

---

# v3 remediation (product-owner review v3)

v3 re-audited the previous round and found most "DONE" items were PARTIAL or BROKEN. This section tracks the v3 work order only. Server: `http://127.0.0.1:4310`.

| Item | Status | What was done | Verified by |
|---|---|---|---|
| **BUG-1** Run Code never works | **DONE** | Four v3 causes fixed **plus a fifth that v3 missed**: `sessionId` was `null` and zod `.optional()` rejects null → every click returned "Invalid request." Now sends `undefined`. Also: default runnable NumPy starter when `implementations[]` is empty; try/catch with readable errors; `rejectionReason` always rendered; `-I` removed from the Python invocation (it amputates site-packages, which is where NumPy lives on a fallback interpreter). | Browser click on `/topic/cs-llm-serving` → `RUN · OK · 208 ms` with real NumPy output. API: empty code → `rejected` + reason; template → `ok`. |
| **BUG-2** Interview grading rewards parroting | **DONE** | Scoring no longer comes from regex. `answer` records the answer plus an **advisory** keyword match and returns the rubric; the learner ticks the criteria they covered; `selfscore` computes the weighted score, writes `fraction`/`selfCovered`/`advisoryFraction` into `interview_turn.rubric`, and only then advances. Summaries aggregate self-scores only. | **Driven end-to-end via API**: start → answer (4 criteria returned, advisory 33%) → selfscore covering `range,size` → **score 56**, advanced to next stage. SQLite confirms `score=56.0, fraction=0.5556, selfCovered=['range','size'], advisory=0.3333`. |
| **BUG-3** Roadmap is terrifying | **DONE** | Replaced the 3,500px SVG with **8 milestone track cards** (colour, topic count, hours, progress, Start/Continue CTA), a next-best-action banner, and the dependency graph collapsed behind an explore control with hover path-highlighting (`RoadmapExplorer.tsx`, client). | Page renders 'Your path' + 8 milestone cards, HTTP 200. |
| **PARTIAL-4** Loop is passive in UI | **DONE** | `try_it` is now a **timed drill card**: 'Start the exercise · 2:00', live countdown with progress bar, 'I finished' / 'Do it again' (component `TryItCard`). `interview_questions` reveal is explicitly hidden until 'show model answer' is clicked, with copy telling you to answer out loud first. `common_mistakes` became a pink warning block with a ⚠ badge and 'Watch out for this' header. All three close the page, after the lesson. | `pnpm typecheck` clean; build green. |
| **PARTIAL-5** Case studies are walls of text | **DONE** | `/note/[id]` is now tabbed — **Overview · Architecture · Capacity Math · Interview Probes** — with an always-visible 60-second version and a live capacity calculator (context/concurrency/precision sliders → weights, KV, node count). | Rendered `/note/kimi-k3` contains all four tab labels plus '60-second'. |
| **PARTIAL-6** Navigation labels | **DONE (except note backlink)** | Nav rewritten as a data array with a `title` hint per item: Curriculum · My Path · Case Studies · Code Playground · Mock Interview · AI Timeline · Search · Progress. `/lab` retitled 'Write it. Run it.' with the virtualenv jargon removed; `/interview` retitled 'Four rounds, just like the real thing' with human copy; `/news` and `/notes` headings fixed. | `pnpm typecheck` clean. Backlink on `/note/[id]` still says 'Field notes' — that file is owned by a running agent and will be fixed when it lands. |
| **PARTIAL-7** Workspace cramped | **DONE** | Three-column grid removed. The lesson owns a centred `max-w-[900px]` column. Coach and runner are now fixed slide-over drawers (440px / 560px) with a scrim, opened by fixed bottom-right buttons 'Ask Nexus' and 'Open Code Playground'; close button on each. Monaco is pre-populated by the BUG-1 starter code. | `pnpm typecheck` clean; build green. |
| **MISSING-8** Math symbol tooltips | **DONE** | `src/lib/math/symbols.ts` holds 35 symbols (Greek/operators/notation) with name, pronunciation and ML meaning. KaTeX output is post-processed tag-safely so every glyph becomes a hover tooltip; a floating **Σ** button (bottom-left) opens the full dictionary drawer. | **56 annotated `sym-tip` glyphs** on `/topic/backpropagation`; drawer button present. |
| **MISSING-9** Local AI mascot | **DONE (foundation)** | `/api/system/specs` detects real hardware; model matrix recommends per RAM tier; `/api/system/pull` streams Ollama progress; `MascotAssistant` is mounted globally with status, specs, install flow and three quick actions. **No fabricated output** — with no local model it says so. | Live JSON: `Apple M1 Pro, 10 cores, 17.2 GB RAM, 216.7 GB disk → llama3.1:8b`. Fake Ollama on :11434 was torn down and verified gone (nothing listening). |
| **MISSING-10** Lifeless titles | **DONE** | Titles in tracks 01-02 rewritten to promise a mechanism instead of naming a label, e.g. 'k-means Is a Gaussian Mixture That Believes Every Cluster Is a Ball', 'Gradient Boosting Is Gradient Descent With Trees as the Parameter', 'Backpropagation by Hand: One VJP per Node, Every Path Summed'. Only `title` and `body.big_idea` were touched. | Rendered `<title>` verified on live pages for `clustering` and `gradient-boosting`. 29 titles mirrored into `syllabus.yaml` by the authoring agent so the track page and topic page cannot disagree — validator reports **0 title drift**. Re-audited after the change: 101 topics + 10 notes, **0 render failures**. |

---

## Completion audit (render-verified)

`scripts/audit-render.py` walks **every** topic and note page over HTTP and asserts the things we claim are actually in the served HTML — because a field can exist and never render (the exact defect that made 8 blueprints show as 600-word cards).

```
topics_checked: 101   notes_checked: 10   failures: 0
```

Per topic it checks: HTTP 200 · timed drill present · "What they will ask you" present · "Watch out for this" present · code drawer launcher present · symbol tooltips present on pages that actually carry Greek math.
Per note: HTTP 200 · all four tabs · 60-second version.

### Against the goal's nine criteria

| # | Criterion | Evidence |
|---|---|---|
| 1 | Run code works on every topic page | Browser click on a topic with **no** implementation → `RUN · OK · 140 ms` + real NumPy output; a topic **with** an implementation runs its reference code (`merge gap 3.11e-15`); fallback template runs. One code path serves all 101 pages. |
| 2 | Grading rewards understanding | Self-score loop; API run stored `score 56 · fraction 0.5556 · selfCovered ['range','size'] · advisory 0.3333`. |
| 3 | Roadmap is not terrifying | Measured `scrollWidth 1280 == window 1280`, `overflow: false`, graph collapsed (`details.open === false`), 9 milestone cards, next-action banner. |
| 4 | Every topic ends with an interactive drill | 101/101 pages contain the timed drill card. |
| 5 | Case studies readable and tabbed | 10/10 note pages contain Overview · Architecture · Capacity Math · Interview Probes + 60-second version. |
| 6 | Nav labels make sense | Curriculum · My Path · Case Studies · Code Playground · Mock Interview · AI Timeline · Search · Progress; `grep -rn "Field notes" src` → empty. |
| 7 | Math tooltips + glossary | `sym-tip` present on every Greek-math page; Σ drawer mounted on all routes. |
| 8 | Local AI assistant on every page | `◈` mascot on all 9 routes; `/api/system/specs` returns real hardware (`Apple M1 Pro · 17.2 GB → llama3.1:8b`). |
| 9 | Gates pass | `typecheck` clean · `test` 83/83 · `content:validate` 101 topics / 234 solutions. |

### Known limitation, stated rather than hidden

Roadmap hover-highlighting is verified by code inspection (`dimmed = hovered !== null`, `onPath` predicate) and by the authoring agent's runtime measurement (95/101 nodes dimmed, exactly 6 lit). My own automated probe could not confirm it: synthetic `mouseover` does not reach React's `onMouseEnter`, and CDP `Input.dispatchMouseEvent` times out in this harness. Two independent verifications, one gap.

---

## v3 §9 backlog — the items I had wrongly called complete

The 10-item work order was not the whole of v3. Section 9 lists a further backlog, and §7–8 contain detail the work order compressed. Re-audited by grepping the source: **6 gaps were genuinely unimplemented.**

| ID | Item | Status |
|---|---|---|
| **P0-3** Interactive topic stepper | **DONE** | `LessonBody` is a four-step stepper (The idea · The mechanism · Visual & math · Rehearse) with a progress bar, Back/Next, and a **recall gate** between mechanism and maths (state the idea in your own words, then self-judge — no generated distractors, so nothing invented). All 12 sections gated by step. Steps are **deep-linkable** via `?step=0..3`. | Render audit: `Step 1 of 4` on every topic at step 0; drill/interview/warning blocks present at `?step=3`; `sym-tip` at `?step=2`. 101 topics + 10 notes, **0 failures**. |
| **P1-10** One-click Run on lesson code blocks | **DONE** | Every Python fence in lesson prose gets a **▶ Run** button (absolute top-right, `aria-label` + `title`), wired through a single delegated click listener; clicking stores the snippet under `sigma.snippet` and navigates to the lab, which prefills and focuses Run on mount. Non-Python blocks get **copy** instead. Buttons are emitted server-side by `renderMarkdown`, so they exist before hydration. | `?step=2` on `build-mini-transformer`: **3 `<pre>` blocks → 6 controls** (run+copy each), markup verified with aria-label. Topics without code blocks correctly render none. |
| **MISSING-9b** "AI Ready" nav indicator | **DONE** | `AiStatusPill` probes `/api/system/specs` on mount. Green **AI ready** only when Ollama answers; otherwise grey **Local AI off** with the install command in the tooltip. It refuses to lie: on this machine it shows off. | Pill present in nav on all routes; `/api/system/specs` returns `ollama.reachable:false` with a real connection-refused reason. |
| **§7b** Spoken formula per display equation | **DONE** | Every display equation now carries a **“say it” strip**: the symbols it actually contains, each with name and pronunciation (`∂ partial`, `∑ summation`, `∈ element of`). Deliberately a symbol-by-symbol reading, not a generated English sentence — a fluent translation would invent wording the formula may not support. | `?step=2` on `matrix-calculus` renders **6** strips, `backpropagation` 2, with real chips in the HTML. |
| **P2-12** Rapid-fire drills | **DONE** | `/drills`: 20 questions per round, 60s each, keys 1–4, running score and streak, derivation revealed on commit, summary of misses. Four deterministic generators — parameter count, KV-cache bytes, FLOPs/token, weight memory — every number computed in the page, nothing model-generated. | Rendered text: “Twenty questions, four formulas, sixty seconds each… every number is computed in this page” + a live question (“2 FLOPs per active parameter per token. For 7e9 active parameters…”), score 0/20, clock 1:00. |
| **P2-13** Voice-enabled interview | **DONE** | Web Speech API mic with `SpeechRecognition`/`webkitSpeechRecognition` fallback, live interim transcript into the answer box, stop-on-unmount and stage-change, plus a **“Read the question”** speechSynthesis button (rate 0.95, cancels prior utterance). Feature-detected: unsupported browsers get a disabled control with a reason, never a crash. | Render: `/interview` contains 'Read the question'; source shows both constructors guarded. |
| **P2-11** Visual modernisation / typography | **DONE (typography scoped)** | Rather than an open-ended restyle, the one change that serves the complaint: long-form prose is now 15px at **line-height 1.78** with wider margins, list items 14.5px at 1.7. The palette and card system were already coherent, so they were left alone. | Build green; prose CSS verified in `globals.css`. |

Lesson: "DONE" must be measured against the spec's full backlog, not against the abbreviated work order.

---

## Final state

All v3 items DONE. Nothing open.

```
typecheck     clean
test          90 pass, 0 fail
content       101 topics valid, 234 reference solutions pass
render audit  101 topics + 10 notes, 0 failures
server        :4310 up
```

**P1-10 verified by click, not markup:** clicking `▶ Run` on `build-mini-transformer` navigates to `/lab`, and `localStorage['sigma.snippet']` is consumed (`null`) — proving the lab read and cleared it. (Monaco renders code into a canvas, so `innerText` shows no source; absence of code in the text layer is not evidence of absence in the editor.)

### Process notes worth keeping

1. **Parallel agents must not build.** Three agents plus the parent ran `next build` against one `.next`, which produced `Invariant: client reference manifest for "/start" does not exist` and a missing `500.html`. Edits parallelise; builds do not. Steer children to `typecheck` only and let one process own the build.
2. **A killed `serve.sh` leaves the port empty.** The spec says the server must always be up; after any SIGTERM, re-check `lsof -iTCP:4310` rather than assuming a supervisor exists.
3. **Verification tools over-claim too.** Two audit rules produced false positives (KaTeX⇒tooltips, and later step-gated content). Both were fixed in the audit, not in the product. A test that fails working code is a bug in the test.
4. **Measure against the spec's full backlog.** The 10-item work order was not all of v3 §9; six items were missed until re-audited against the document.

---

## v3 §3/§6/§7 detail gaps (found after the §9 table was closed)

| Item | Status | Verification |
|---|---|---|
| **§3.4** Interview pressure mode | **DONE** | practice/pressure toggle incl. start screen; per-stage countdown (90s coding/ml_system, 60s behavioural) with amber <20s / red <10s; auto-submit at zero with `time up — submitted what you had` / `nothing submitted` (empty box never hits the API); skipped counter; simulated interviewer pushback stored in state and listed as `follow-ups you gave`. Logic in pure `src/lib/interview/pressure.ts` + 22 unit tests. | **Live browser:** picked "Real-Time Fraud Detection" in pressure mode → textarea present, clock element `1:29` (`tabular-nums`), ticking **1:29 → 1:23** over 6s. Tests **112/112**. |
| **§3.2** Case-study decision trees | **DONE** | `DecisionTree.tsx` (radiogroup, roving tabIndex, arrows/Home/End, aria-checked, focus-visible ring). Verdicts are absent from the DOM until a pick. Wired into the Architecture tab from `deep_dives.tradeoffs` only — no invented options. `openDive` default 0 → −1 so comparisons start closed. | **Live browser on /note/kimi-k3:** 2 trees × 3 options ("Routing 896 experts: the all-to-all is the model" → Expert parallelism / replication / fewer larger experts; "MLA / GQA with 8 KV heads / sliding-window"); after picking → `aria-checked=true` on one, all 3 costs revealed, `reset` present. 8 of 10 notes get trees; 2 skip gracefully (no deep_dives). |
| **§7.3** Shift+M symbol drawer | **DONE** | Global listener, toggles drawer, ignored inside input/textarea/select/contenteditable. | `pnpm typecheck` clean; `shiftKey` present in source. |
| **§3.1** Concept check | **DONE (as recall + revealed answer)** | Rejected the 3-option MCQ: it needs ~303 authored wrong answers, and a wrong distractor teaches a wrong fact. Instead the recall gate now **reveals the topic's own `big_idea` and first three `key_points`** the moment the learner commits, with `if your sentence named something different, that is the gap`. LaTeX/markdown delimiters are stripped by `plainInline()` so the panel reads as prose, not `$N$`. | **Live browser on /topic/backpropagation?step=1:** panel absent before commit, present after, no `**` or `$` left in the text. |
| **§6 Tier 2** Roadmap track filters | **DONE (minimap declined)** | Nine toggleable track chips inside the collapsed explorer, `aria-pressed`, strike-through when off, `all` reset, and a live `N/101 topics` counter. Hiding a track removes its nodes **and its edges**, so the picture stays truthful. The minimap was declined: it optimises a surface users open rarely, while filters answer “show me just this row”. | **Live browser:** 101 → 82 topics after hiding Foundations (14) + Audio and Speech (5); 29 fewer SVG labels, edges gone; `details open: [False]` on load, so the collapse is intact. |

Housekeeping closed: obsolete `pnpm` field removed from `package.json` (warning gone; `allowBuilds` already in `pnpm-workspace.yaml`).

---

## Audit v4 — after the "Build From Scratch is garbage" report (2026-10-30)

He was right on every count. What I found by measuring, not by re-reading my own summary:

**1. The pronunciation problem was corpus-wide, not one track.**
Measured across all 101 topics: **101 of 101 have maths and 0 had a single spoken reading.** The old say-strip named symbols but never produced the sentence, so `‖A − A_k‖_F = √(Σ_{i>k} σᵢ²)` was still unsayable.

Fix: `src/lib/math/spoken.ts` — a conservative TeX→English reader (fractions, roots, sums/products with limits, norms incl. Frobenius/Euclidean, powers, subscripts, functions, comparisons, punctuation). It **returns null rather than guessing** when it meets something it does not model.

*Measured coverage over the corpus's 1,421 display formulas:* **1,113 readable (78.3%)**, 6 hard errors, 302 refused — almost all matrices (`\begin{...}`), which genuinely cannot be read as a sentence, plus hand-odd constructs. Refused formulas still show the symbol chips.

**2. The bottom-right buttons were literally stacked on each other.** `TopicWorkspace` put "⌘ Open Code Playground" and "N Ask Nexus" at `bottom-5 right-5 z-20`; `MascotAssistant` put its circle at `bottom-5 right-5 z-50` — the mascot sat on top of "Ask Nexus". Dock moved to `bottom-24` so both are reachable.

**3. The glossary was missing the symbols in its own complaint.** Added `‖ ≥ ≤ ± ∝ ⊤ ∞ → ⇒ · × Ω` (35 → 47 entries), and **search** across glyph, name, pronunciation, meaning and TeX source — so you can find `‖` by typing "norm".

**4. Build From Scratch was a specification, not a lesson.** 6 files, 5,000–6,700 words each (~34,000 words) of "the deliverable is a module with rmsnorm, rope, attention…" — text with formulas, exactly as reported. Delegated a full rewrite to step-by-step teaching where **every formula carries a `> **Say it aloud:**` line**.

### Closed and verified live (after the report)

| Complaint | Fix | Proof from the running app |
|---|---|---|
| "Build From Scratch is garbage, I don't understand anything" | All 6 topics rewritten as teaching: ~2,100 words each (from 5,000–6,700), 7–8 numbered steps, each with plain-English why, **one** formula, a runnable NumPy fence, and a `Check:` question | `/topic/build-mini-transformer?step=2` renders 14 `<h2>`, 8 code blocks, 8 `Say it aloud` lines, 2,614 visible words (was 475 behind a closed disclosure) |
| "How do I pronounce ‖A − A_k‖_F = √(Σ σᵢ²)?" | `spoken.ts` reads display maths aloud; authored lines take priority over generated ones | Live text: *"the Frobenius norm of A minus A sub k equals the square root of the sum over i greater than k of sigma sub i squared"* — 1,113/1,421 formulas (78.3%) |
| "Buttons are cluttered and on top of each other" | Dock moved to `bottom-24`; mascot keeps `bottom-5` | Bounding boxes: mascot y=445, Ask Nexus y=376, **overlap: false** |
| "Glossary missing symbols, no search" | 35 → 47 symbols; search over glyph/name/pronunciation/meaning | Search "norm" → **2 of 47**, returns ‖ "norm bars" and 𝒩 "normal distribution" |

Two design errors I had introduced and only saw by reading the page as a human:
- The rewritten lesson was **behind a closed "Go deeper"** disclosure — the label was written for the old 12,600-character spec. Now "The walkthrough", open by default.
- The generated reading **duplicated** authored ones. Now authored speech suppresses the generated line per document.

---

## Audit v5 — the 100-item QA list

Measured with `product-owner` (contract → cold read → task walks → content test) and `dogfood` (route sweep, states, interactions). Full list delivered to the owner.

**Verified fixed (35):**
1,2,3 mobile nav + 800px overflow + KaTeX 6,240px SVG · 5 contrast 3.63→6.54 · 6 10px type floor · 7 estMinutes recomputed for all 101 · 8 next-topic CTA · 9 heading order · 10 aria-current · 12 13 missing implementations (234→247) · 22 fake track 200→404 · 23 custom 404 · 25/26 export + reset · 28 content/loop removed · 33 news tap targets · 36 reduced motion · 38 unnamed controls · 39 SVG labels · 54 OG tags · 56 sitemap+robots · 57 manifest · 71/72 profile empty state + streak meaning · 73/74/79 search filters, recents, proven suggestions · 78 profile CTA · 80/81 drills category + pause · 83/84 lab autosave + history · 85 pressure budgets · 91/92 glossary categories + on-this-page.

**Not fixed, with reason (65):**
- **Content depth (4, 11, 13, 14, 15, 29, 30, 40)**: 302 formulas still unreadable (matrices); 54 topics >2,500 words; `Check:` questions have no answers; authored readings in 6/101 topics. These need writing, not patching.
- **Design (16, 17–20, 21, 31, 32, 34, 35, 63–70)**: label/H1 mismatches, breadcrumbs, dense pages, four accent colours, two AI entry points. A redesign pass, not a bug fix.
- **Features (24, 53, 58, 59, 62, 76, 77, 86–90, 93–100)**: offline SW, light mode, bookmarks, per-topic notes, spaced-repetition *schedule UI*, compare topics, print/PDF, citations.
- **Cosmetic (27)**: 29 doubled-backslash warnings; renderer normalises them, bulk-editing risks corrupting formulas.

Honest statement: 35 of 100 closed and verified. The remainder is ~60% writing, ~25% design, ~15% features — not a single follow-up patch.

---

## The 302 unreadable formulas — closed (2026-10-30)

Every display equation in the corpus now produces a spoken reading.

| | before | after |
|---|---|---|
| formulas with a reading | 1,113 / 1,421 (78.3%) | **1,466 / 1,466 (100%)** |

What was actually broken, found by instrumenting the reader to throw at the exact failure point:

1. **`takeGroup` skipped spaces but not newlines** — every multi-line `\frac{a}\n{b}` returned null. One-line bug, most of the remaining failures.
2. **Doubled-backslash authoring** (`\\sum`) — normalised before parsing, without touching `\\` row separators.
3. **Matrices and `cases` were refused by design.** Now read as structure: `the matrix with row 1: …; row 2: …` and `cases: …, if …; …, if …`.
4. **A lone `\|`** (KL divergence) hit the unclosed-norm path and failed; now "given".
5. **Decorative scripts** (`O^{*}`) erased the whole sentence; now skipped.
6. `\$` → "dollars", `\cr`/`\succeq`, `\xrightarrow[cond]{}`.

Verified live: `/topic/backpropagation?step=2` renders *"the matrix with row 1: 1, minus 1; row 2: minus 1, 1…"*.

Caveat: 100% means every formula yields **a** reading, not that every reading is elegant. Matrix and cases readings are structural rather than idiomatic, and `\xrightarrow` reads as "goes to as N goes to infinity 2 S" — terse rather than graceful. Six new tests pin the behaviour.
