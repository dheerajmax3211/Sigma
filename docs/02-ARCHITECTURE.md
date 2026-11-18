# Sigma — System Architecture


---

## 1. Shape of the system

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Electron shell (planned)                                                │
│  ├── spawns the Next standalone server as a child, dynamic port          │
│  ├── ELECTRON_RUN_AS_NODE + Helper.app  → no macOS Dock tile             │
│  └── loads http://127.0.0.1:<port>                                       │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│  Next.js 16 standalone server                                            │
│                                                                          │
│  app/                                                                     │
│   ├── /                     dashboard (tracks, progress, stats)          │
│   ├── /topic/[id]           three-pane study workspace                  │
│   ├── /track/[id]           curriculum track index                      │
│   ├── /lab                  standalone execution sandbox                 │
│   ├── /interview            mock technical interview                     │
│   └── /api/coach/hint       ★ tier-gated Socratic hint ladder           │
│       /api/exec/run         ★ sandbox execution + deterministic analysis│
│                                                                          │
│  lib/                                                                     │
│   ├── db/         schema.ts (versioned migrations) · index.ts · seed.ts  │
│   ├── content/    schema.ts (Zod) · loader.ts (YAML → validated corpus)  │
│   ├── coach/      tiers.ts (the ladder) · nexus.ts (prompts + offline)   │
│   │               providers.ts (Anthropic/OpenAI/Gemini/Ollama/local)    │
│   ├── analysis/   complexity.ts ★ deterministic AST profiler             │
│   ├── exec/       sandbox.ts (isolated child process + metrics)          │
│   ├── render/     markdown.ts (isomorphic markdown + KaTeX)             │
│   └── viz/        linalg.ts (Jacobi eigensolver, SVD, Eckart–Young)      │
│                                                                          │
│  components/   TopicWorkspace · HintLadder · ProblemRunner ·             │
│                CodeEditor (Monaco) · VisualizerHost · DerivationView ·   │
│                CheckpointList                                            │
│                                                                          │
│  content/      tracks/<track>/topics/*.yaml  ← authored curriculum      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│  Local storage (never a network call for user data)                     │
│  ├── SQLite: sigma.db  (WAL, foreign keys, FTS5)                    │
│  ├── YAML corpus: the authored curriculum (the source of truth)         │
│  └── ~/.sigma/venv: NumPy / PyTorch sandbox interpreter             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The seven decisions that matter

### 2.1 The hint ladder is server-enforced, not a UI affordance

**The reference app** persisted the revealed hint tier in a column called `advanced` on
the `messages` table, but the gating itself lived in the client.

**Here**, `POST /api/coach/hint` owns the ladder:

```
revealedTier = session.tier
if (requested > revealedTier + 1) → 409 "locked"
```

A client cannot request tier 5 without having revealed tiers 1–4. The
progress lives in `coach_session.tier`, so it survives reloads and is shared
across devices without a sync service (there is no sync service).

*Verified:* `POST tier=5` → `409 {"error":"Tier 5 is locked. Reveal tier 1 first.","maxAvailableTier":1}`.
After revealing tier 1, tier 2 unlocks and 3–5 stay locked.

### 2.2 The model explains; the profiler computes

**The reference app** asked the LLM to "analyze your solution's structure" and then
displayed the caveat: *"Analyzed from your code's structure, not measured —
the chart shows relative operation count, not real time."* That is a guess
with a disclaimer.

**Here**, `src/lib/analysis/complexity.ts` is a real static analyser:

| Capability | Implementation |
|---|---|
| Loop nesting depth | Indent-based AST scan (Python) |
| Complexity verdict | Product of per-level costs → `O(n)`, `O(n²)`, `O(n³)` |
| Recursion | Detected; the recursive argument is checked for shrinkage |
| Space | Container allocation and recursion depth → `O(1)` vs `O(n)` |
| False positives | Strings and comments stripped before analysis |

The result carries its own **derivation** (the reasoning chain) and its own
**unknowns** (what it could not determine). The model receives that analysis
as a prompt input and is asked to *teach* it — it never produces it.

*Verified:* `for i in range(n): for j in range(n):` → `O(n²)` with the
derivation "Detected 2 loop constructs, maximum nesting depth 2" and the
warning "Two nested loops — quadratic time".

### 2.3 The platform works with no API key

Every provider failure path degrades to a **deterministic coach** rather than
an error. The offline coach composes a real answer from the topic's authored
hint content plus the AST analysis — it is not a stub and it is not an
apology.

Provider errors keep the reference app's genuinely good taxonomy — *invalid key*,
*network*, *rate-limited*, *not found*, *server error* — because those need
three different user actions.

### 2.4 Content is authored in YAML, validated in CI, projected into SQLite

The reference app stored 902 YAML files and validated them with Zod **at request time**,
so a malformed file surfaced as a runtime error for a learner.

**Here** the YAML remains the authoring format (reviewable, diffable, no
database tooling required), but:

- Schemas live in one place (`src/lib/content/schema.ts`) and are shared by
  the loader and the validator.
- `npm run content:validate` fails the build on a malformed file, an unknown
  prerequisite, a missing hint tier, or a reference solution that does not
  pass its own test cases.
- The database holds a **projection** of the corpus (`track`, `topic`,
  `prerequisite`, `topic_fts`) so that foreign keys from progress and
  sessions are real, and so FTS5 can search it.

*Verified:* the validator caught a genuine bug in this repo's own reference
solution — a PCA implementation that computed the SVD of the **uncentred**
data. It passed a naive test and produced ratios of `0.833` instead of
`1.0`. It now fails the build if that regresses.

### 2.5 The sandbox isolates, times, and validates per case

The reference app ran learner code as a child process with no isolation and recorded
pass/fail plus a runtime/memory pair.

**Here** (`src/lib/exec/sandbox.ts`):

- Runs in a dedicated virtualenv (`~/.sigma/venv`) so NumPy/PyTorch are
  available without touching the system Python.
- Runs with `-I -B` (isolated mode, no bytecode writes) in a fresh temp
  directory, with `HOME` pointed at it.
- Runs in its **own process group**, so a timeout kills the whole tree,
  including anything the learner code spawned.
- Enforces a wall-clock timeout (default 10 s) and caps captured output at
  256 KB.
- Runs a **preflight refusal** for `subprocess`, `os.system`, `os.remove`,
  `shutil.rmtree`, raw `socket`, `__import__`, and write-mode `open`. These
  are refusals, not a security boundary — and the code says so.
- Validates **per test case** with numeric-aware tolerance comparison, and
  reports the actual value alongside the expected one.

*Verified:* 8/8 sandbox tests pass, including a real timeout kill
(`while True: pass` → `status: "timeout"`), NumPy import, and a case where
1 of 2 tests fails with `expected 5, got 4`.

### 2.6 State is local, versioned, and searchable

| The reference app | Sigma |
|---|---|
| 16 tables, ad-hoc `ALTER TABLE ADD COLUMN` | 16 tables, **versioned migration ledger** (`schema_migration`) |
| No FTS | **FTS5** over topics and memory notes |
| `memory_notes` with a flat `expires_at` | Same shape, plus **local embedding** columns (`embedding`, `embedding_dim`) |
| Keys in plaintext `config.json` | `credential` table holds **keychain references only**; secrets never enter the DB |

The migration ledger means a database always has a knowable shape, and the
migration runs inside a transaction so a failure rolls back rather than
leaving a half-migrated schema.

### 2.7 The coach prompt forbids over-disclosure

The single most important line in the prompt is a prohibition:

```
The NEXT tier is "Derivation" (The mathematics worked out).
You MUST NOT reveal it. Do not name it as a coming step.
```

This is what makes the ladder a ladder. The reference app achieved the equivalent
property for *stages* — its advance criteria contained anti-loop guards such
as *"If their code already matches the optimal approach below, do not ask
them how to improve it further... there isn't any."* That instinct is
preserved and generalised from stages to tiers.

---

## 3. The visualizers

Three canvas-based visualizers ship with the first module, all computing
locally in the browser so a slider drag is instantaneous:

| Visualizer | What it teaches | Math engine |
|---|---|---|
| `vs-eigen` | How a matrix acts on directions; eigenvectors are the fixed directions | `jacobiEigen` |
| `vs-pca-projection` | PCA is the projection that captures maximum variance | `jacobiEigen` on the covariance |
| `vs-svd-spectrum` | The singular value spectrum and the Eckart–Young curve | `svd` + `eckartYoungResidual` |

`src/lib/viz/linalg.ts` implements a cyclic **Jacobi eigensolver** and an
SVD derived from the eigendecomposition of $A^\top A$ — the same derivation
the lesson teaches. The visualizer and the lesson use the same mathematics.

*Verified:* 10/10 linear-algebra tests pass, including the property that
eigenvectors of a symmetric matrix are orthonormal and satisfy $Av = \lambda v$.

### A note on the headless screenshot

The visualizer canvases render correctly (verified by extracting
`canvas.toDataURL()` and by reading the bitmap directly). Headless Chrome's
`Page.captureScreenshot` does **not** composite canvas layers, so a
screenshot shows the plot area as empty. This is an environment limitation,
not an application bug — and it is worth knowing before someone else
"verifies" the visualizers with a screenshot and concludes they are broken.

---

## 4. What is deliberately *not* built yet

Honesty about scope. The following are designed but not implemented, and the
code does not pretend otherwise:

| Area | State |
|---|---|
| Electron shell | Planned; the Next standalone server already runs on a dynamic port and native desktop packaging is done with a bundled Node server in a WKWebView shell on macOS |
| OS Keychain integration | `credential.keychain_ref` is the storage slot; the Keychain call is not written |
| Local embeddings | `memory_note.embedding` / `embedding_dim` columns exist; the embedding model is not wired |
| Attention / loss-surface visualizers | **Built.** `src/components/visualizers/Interactive.tsx` renders `loss_surface` (orbitable 3-D bowl with a live gradient-descent trajectory), `attention` (real softmax(QKᵀ/√d) heatmap, 3 heads, scale slider), `tensor`/`shape_flow` (shape algebra through a transformer block) and `computation_graph` (forward/backward with local derivatives). Dispatched by `kind`, not by id |
| Mock interview mode | **Built.** `src/lib/interview/engine.ts` + `/api/interview` + `/interview`. Four staged questions (clarify → approach → complexity → production edge), scored by a published, deterministic rubric that names every missed criterion |
| PyTorch / Triton in the sandbox | NumPy is installed and verified; PyTorch is not |
| Non-Python language profiles | The AST profiler explicitly reports "not implemented" rather than guessing |

---

## 5. Running it

```bash
# Managed virtualenv (outside the project, so the bundler never traces it)
python3.12 -m venv ~/.sigma/venv
~/.sigma/venv/bin/python -m pip install numpy

pnpm install
pnpm test                 # 59 unit tests
pnpm content:validate     # schema + reference solutions execute and pass
pnpm build && pnpm start  # http://127.0.0.1:3000
```

Data lives in `~/Library/Application Support/Sigma/data/` on macOS.
`SIGMA_DATA_DIR` overrides it (the test suite uses this).
