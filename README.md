# Σ Sigma

**A free, local-first learning platform for AI, machine learning and the software-engineering interview, built by someone who needed it.**

Hi, and welcome. 👋

I'm a developer on the job hunt, and I built Sigma while I was preparing: to get hired, and to get better at the craft. I couldn't find one place that taught the *right* things in the *right order* and made me prove I'd understood them. So I made it, and I've been studying from it every day.

Nothing here is filler. Every lesson, drill and build is something I either needed to learn or got asked about. It's curated for one kind of person: **someone who wants to learn this properly, not skim it.** If that's you, pull up a chair.

Everything runs on your machine. No account, no cloud, no tracking, no paywall.

---

## What's inside

| | |
|---|---|
| **192 bite-sized lessons** | One idea per lesson, an analogy first, then the maths, then the code. Drag the sliders, step through the animation, break it and see why. |
| **97 hands-on practice cards** | Write real code in the browser editor; tests run in a sandbox and tell you exactly what failed. |
| **A day-by-day 8-week path** | Maths → Python → ML → LLM apps → RAG → agents → deployment. Open it, press *Continue*, repeat. |
| **DSA, pattern by pattern** | Two pointers, prefix sums, heaps, greedy, graphs… with step-through animations instead of walls of text. |
| **6 guided builds + a 4-stage capstone** | Small projects that compound into one you can show in an interview. |
| **Interview prep** | Stories, ML and LLM questions, system design, and live coding, plus a mock-interview mode with a published rubric. |
| **A coach that can't spoil it** | A 5-tier hint ladder (concept → direction → pseudocode → derivation → full solution), **enforced by the server**, so you can't jump to the answer by accident. Works offline; plug in Claude, OpenAI, Gemini or Ollama if you want model-written coaching. |
| **Measured, not guessed** | The complexity analyser parses your code's AST and *computes* the answer. No model makes up a Big-O. |

## How to use it

1. Open **Learn** and hit **Start**. Do one lesson a day, or ten. It remembers where you stopped.
2. Do the practice card at the end of each lesson *before* you look at the hint.
3. When you're stuck, climb the hint ladder one rung at a time. The struggle is the point.
4. In the last weeks, switch to **Interview prep** and run the mock interviews out loud.

---

## Run it

You need Node 20+ and [pnpm](https://pnpm.io). Python 3.12 is only needed for the code sandbox.

```bash
# 1. Sandbox interpreter (kept outside the project on purpose)
python3.12 -m venv ~/.sigma/venv
~/.sigma/venv/bin/python -m pip install numpy

# 2. Install and check everything is healthy
pnpm install
pnpm test               # unit tests
pnpm content:validate   # every lesson parses and every reference solution passes its tests
pnpm decks:validate     # every deck's maths and animations check out

# 3. Go
pnpm dev                # http://127.0.0.1:4310
```

Your progress lives in a local SQLite database under your user data folder (on macOS: `~/Library/Application Support/Sigma`).

## How it's built

Next.js 16 · React 19 · Tailwind v4 · SQLite (better-sqlite3, FTS5 search) · Zod-validated YAML content. Lessons are plain YAML in `content/`, so adding or fixing one is a text edit, and the validators will tell you if you broke something. See [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md), [`docs/03-CURRICULUM.md`](docs/03-CURRICULUM.md) and [`docs/AUTHORING.md`](docs/AUTHORING.md).

```
content/       the curriculum (source of truth)
src/app/       routes and API
src/lib/       coach, sandbox, analysis, content loader, database
src/components/ the UI: players, visualisers, editors
docs/          architecture, curriculum and authoring guides
```

## Contributing

Found a mistake, a confusing explanation, or a topic that should be here? Open an issue or a PR. Lessons are small YAML files, so fixes are easy. Run `pnpm content:validate` before you push.

## A note

This is a personal project, built in the open while job hunting. If it helps you land a role or finally understand something that wouldn't click, that's the best outcome I could ask for. Good luck. You've got this. ∑

*— Dheeraj*
