# Sigma — Curriculum Blueprint

Seven tracks, 92 planned topics, each one carrying: a full derivation, a
from-scratch implementation, a five-tier hint ladder, self-check questions,
interactive diagrams, and interview-style problems with automated tests.

**The authoritative plan is [`content/syllabus.yaml`](../content/syllabus.yaml).**
It lists every topic, its position in its track, and its prerequisites — and
`npm run content:validate` enforces it: prerequisites must resolve, must
appear earlier in the same track, and the whole graph must be acyclic. A
topic that breaks the chain fails the build.

Run the validator to see live progress:

```bash
npm run content:validate
#   7/92 syllabus topics authored (8% of the planned corpus); 85 still to write
```

**Shipped so far** (7 topics, 7,160 lines, 21 executed reference solutions):

| # | Topic | Lines |
|---|---|---|
| 1 | Linear Algebra Foundations for Machine Learning | 1,447 |
| 2 | Vectors and the Geometry of High-Dimensional Space | 858 |
| 3 | Matrix Calculus: Gradients, Jacobians, and Hessians | 1,105 |
| 4 | Numerical Linear Algebra: Stability and Conditioning | 792 |
| 5 | Probability Distributions and the Central Limit Theorem | 952 |
| 6 | Information Theory: Entropy, KL Divergence, and Cross-Entropy | 753 |
| 7 | Convexity and the Geometry of Optimization | 1,253 |

**Status legend:** ✅ shipped · ◻ designed, not yet written

---

## Track 0 — Foundations `foundations` ✅ (1/14 topics shipped)

*Mathematics, code, and the machinery underneath modern ML.*

| # | Topic | Status |
|---|---|---|
| 1 | Linear Algebra Foundations for Machine Learning | ✅ |
| 2 | Vectors & Geometry of High-Dimensional Space | ◻ |
| 3 | Matrix Calculus: Gradients, Jacobians, Hessians | ◻ |
| 4 | Numerical Linear Algebra: Stability & Conditioning | ◻ |
| 5 | Probability Distributions & the Central Limit Theorem | ◻ |
| 6 | Information Theory: Entropy, KL, Cross-Entropy | ◻ |
| 7 | Maximum Likelihood & Bayesian Inference | ◻ |
| 8 | Convexity & the Geometry of Optimization | ◻ |
| 9 | Gradient Descent: SGD, Momentum, RMSprop, Adam, AdamW, Lion | ◻ |
| 10 | Learning Rate Schedules & Warmup | ◻ |
| 11 | Numerical Stability: Vanishing & Exploding Gradients | ◻ |
| 12 | The Chain Rule at Scale: Backpropagation by Hand | ◻ |
| 13 | Randomness, Reproducibility & Seeding | ◻ |
| 14 | Reading Papers: A Working Method | ◻ |

**Shipped topic depth** (Linear Algebra Foundations) — the template every
other topic follows:

- `big_idea`, 4 `problem` bullets, a multi-paragraph `analogy`
- 9 `concept_points` — each a complete explanation with a number and a trap
- 10 `definitions` glossary entries
- **7 structured interactive diagrams**: a `compare`, a 6-node `architecture`
  with clickable detail, a 5-step `pipeline`, a 4-layer `stack`, a `graph`,
  a `cycle`, and a `plot` chart
- ~2,900 words of prose with 5 tables and full LaTeX
- 4 worked derivations (2×2 eigenvalues; SVD from $A^\top A$; PCA optimality
  via Lagrange multipliers; ridge's effect on the spectrum)
- 2 from-scratch NumPy implementations (power iteration + SVD, Cholesky +
  Gaussian sampling) with notes on when each is numerically wrong
- 5 self-check questions with hints and answers
- 3 interactive visualizers
- 3 problems with automated test suites that **execute and are verified by
  the build**
- 5 hint tiers, each with its own blocks and checkpoint

---

## Track 1 — Core ML `core-ml` ◻

*The classical models, built rather than imported.*

| # | Topic | Status |
|---|---|---|
| 1 | Linear Regression: Normal Equations, GD, and Their Failures | ◻ |
| 2 | Regularisation: Ridge, Lasso, Elastic Net | ◻ |
| 3 | Logistic Regression & the Decision Boundary | ◻ |
| 4 | K-Nearest Neighbours & the Curse of Dimensionality | ◻ |
| 5 | Decision Trees: Gini, Entropy, and Overfitting | ◻ |
| 6 | Random Forests & Bagging | ◻ |
| 7 | Gradient Boosting: XGBoost & LightGBM | ◻ |
| 8 | Support Vector Machines: Kernels & the Dual | ◻ |
| 9 | Naive Bayes & Laplace Smoothing | ◻ |
| 10 | Clustering: k-means, GMM, and the Elbow Method | ◻ |
| 11 | Dimensionality Reduction: PCA, LDA, t-SNE, UMAP | ◻ |
| 12 | Evaluation: Bias–Variance, ROC, PR, Calibration | ◻ |
| 13 | Imbalanced Data & Resampling Strategies | ◻ |
| 14 | Feature Engineering & Leakage | ◻ |
| 15 | Time Series: Autocorrelation, Stationarity, Forecasting | ◻ |

---

## Track 2 — Deep Learning from Scratch `deep-learning` ◻

| # | Topic | Status |
|---|---|---|
| 1 | Autograd Engine from Scratch (micrograd → tensor) | ◻ |
| 2 | Computational Graphs & the Chain Rule | ◻ |
| 3 | MLP: Layers, Activations, Initialisation | ◻ |
| 4 | Convolutions: from Kernel to Feature Maps | ◻ |
| 5 | Pooling, Stride, Padding & the Shape Algebra | ◻ |
| 6 | Batch Normalisation & Layer Normalisation | ◻ |
| 7 | Residual Connections & the Depth Problem | ◻ |
| 8 | RNNs, LSTMs & GRUs | ◻ |
| 9 | Regularisation: Dropout, Weight Decay, Augmentation | ◻ |
| 10 | Optimisation in Practice: Schedules, Warmup, Clipping | ◻ |
| 11 | CNN Architectures: ResNet, EfficientNet, ConvNeXt | ◻ |
| 12 | Recurrent Architectures: LSTM, GRU, Temporal Convolution | ◻ |

---

## Track 3 — Transformers & Generative AI `transformers` ◻

| # | Topic | Status |
|---|---|---|
| 1 | Attention from First Principles: Q, K, V | ◻ |
| 2 | Multi-Head Attention & Multi-Query Attention | ◻ |
| 3 | Positional Encoding: Absolute, Relative, RoPE | ◻ |
| 4 | LayerNorm vs BatchNorm vs RMSNorm | ◻ |
| 5 | The Full Transformer Block: SwiGLU, Residuals, Scaling | ◻ |
| 6 | Tokenisation: BPE, WordPiece, SentencePiece | ◻ |
| 7 | Decoding: Greedy, Beam, Top-k, Top-p, Temperature | ◻ |
| 8 | KV Cache & the Memory Wall | ◻ |
| 9 | Pretraining Objectives: LM, MLM, Prefix LM | ◻ |
| 10 | Fine-Tuning: Full, LoRA, QLoRA, Prefix, Adapter | ◻ |
| 11 | Preference Optimization: RLHF, DPO, and their failure modes | ◻ |
| 12 | FlashAttention 1/2/3 & FlashDecoding | ◻ |
| 13 | Mixture of Experts: Routing, Load Balancing, Expert Choice | ◻ |
| 14 | Long Context: Sliding Window, RoPE Scaling, YaRN | ◻ |
| 15 | Quantization: GPTQ, AWQ, INT8/INT4, FP8 | ◻ |

---

## Track 4 — Vision & Multimodal `vision-multimodal` ◻

| # | Topic | Status |
|---|---|---|
| 1 | Vision Transformers: Patch Embeddings & the ViT Block | ◻ |
| 2 | Contrastive Learning: CLIP & InfoNCE | ◻ |
| 3 | Diffusion Models: DDPM from scratch | ◻ |
| 4 | Score-Based Matching & SDEs | ◻ |
| 5 | DDIM & Fast Sampling | ◻ |
| 6 | Classifier-Free Guidance | ◻ |
| 7 | Multimodal Architectures: Fusion Strategies | ◻ |
| 8 | Document & Chart Understanding | ◻ |

---

## Track 5 — Distributed Systems & MLOps `distributed-mlops` ◻

| # | Topic | Status |
|---|---|---|
| 1 | Data Parallelism (DDP) & Gradient Synchronisation | ◻ |
| 2 | FSDP / ZeRO Stages 1–3 | ◻ |
| 3 | Tensor Parallelism (Megatron-LM) | ◻ |
| 4 | Pipeline Parallelism & Bubbles | ◻ |
| 5 | Sequence & Expert Parallelism | ◻ |
| 6 | Continuous Batching & PagedAttention (vLLM) | ◻ |
| 7 | Speculative Decoding | ◻ |
| 8 | KV Cache Quantisation & Prefix Caching | ◻ |
| 9 | Custom Kernels: Triton & CUDA Basics | ◻ |
| 10 | Fused Kernels: FlashAttention & GEMM | ◻ |
| 11 | The Inference Cost Model | ◻ |
| 12 | Experiment Tracking & Reproducibility | ◻ |
| 13 | Model Serving: Batching, Queues, Autoscaling | ◻ |
| 14 | Monitoring & Drift Detection | ◻ |

---

## Track 6 — Staff / Principal MLE `staff` ◻

| # | Topic | Status |
|---|---|---|
| 1 | Designing TikTok-scale Video Recommendation | ◻ |
| 2 | Multimodal Search at Scale | ◻ |
| 3 | Real-time Fraud Detection | ◻ |
| 4 | Latency-Critical RAG | ◻ |
| 5 | Ads & Auction Systems | ◻ |
| 6 | Feature Stores & Training/Serving Consistency | ◻ |
| 7 | Personalisation & Exploration | ◻ |
| 8 | Ranking vs Recommendation vs Retrieval | ◻ |
| 9 | The Cost of a Bad Model in Production | ◻ |
| 10 | Technical Leadership: Leverage Without Authority | ◻ |
| 11 | Design Review: What Senior Engineers Get Wrong | ◻ |
| 12 | Research Judgement: When to Trust a Result | ◻ |

**30+ system-design case studies** will use the reference app's proven case-study
schema (`problem_statement`, `big_idea`, `clarifying_questions[]` with
`why_it_matters`, functional/non-functional requirements, and
`capacity_estimation` with `assumptions` and worked `math`) — the schema that
made the reference app's system-design content genuinely useful rather than a list of
buzzwords.

---

## Cross-cutting work

| Deliverable | Count | Status |
|---|---|---|
| Coding & implementation challenges with automated test suites | 100+ | 3 ✅ (in the first module) |
| System-design case studies | 30+ | ◻ |
| Interview question bank (oral + live coding) | 100+ | ◻ |
| Interactive visualizers | 12+ | 3 ✅ |

### Visualizer backlog

| Kind | Planned instances | Status |
|---|---|---|
| `tensor` — shape & dimension explorer | 4 | 2 ✅ |
| `attention` — Q/K/V heatmaps with animation | 4 | ◻ |
| `loss_surface` — 3D gradient descent on a loss landscape | 2 | ◻ |
| `computation_graph` — forward/backward graph animation | 2 | ◻ |

The `VisualizerSchema.kind` enum already declares all four kinds, so adding
one is a matter of writing a renderer and a YAML entry — no schema change.

---

## How a topic gets written

The shipped topic is the reference implementation of this workflow:

1. **Prose** in `body.markdown` — LaTeX between `$…$` and `$$…$$`.
2. **Derivations** in `body.derivations[]` — one entry per mathematical step,
   each with `title`, `latex`, and `prose`.
3. **Implementations** in `body.implementations[]` — from-scratch code with a
   `note` explaining when it is numerically wrong.
4. **Hints** in `body.hints[]` — all five tiers, each with `content`,
   `blocks[]`, and a `checkpoint`.
5. **Checkpoints** in `body.checkpoints[]` — self-assessment with hints.
6. **Visualizers** in `body.visualizers[]`.
7. **Problems** in `body.problems[]` — prompt, starter, test cases with
   tolerances, reference solution, and explanation.

Then:

```bash
npm run content:validate   # schema + every reference solution must pass
```

That command is the gate. It is what caught the uncentred-PCA bug in the
first topic, and it will catch the next one.
