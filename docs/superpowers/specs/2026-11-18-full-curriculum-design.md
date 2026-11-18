# Full curriculum in lesson format: design

## Intent
One app that takes the learner (starts at zero maths, wants an AI Software Engineer job in 8 weeks) from nothing to job-ready, in every field. Everything is a card-by-card lesson like `/learn`: short cards, live sliders, one idea per card, every symbol explained. The old 101-topic curriculum (about 960k words, long scroll) is rewritten into this format, not just hidden.

## Goals
- Every area a hire needs is covered: maths, Python, ML, deep learning, LLM apps, RAG, agents, backend and infra, system design, **DSA**, **interview**.
- Lessons about 20 minutes and 14 cards. Two labs, worked examples, a harder check, a mistakes card.
- Hand-written by Claude, validated by `checkDeck`, shipped in batches so the app is complete after each one.
- One home page and one nav: Learn first, grouped into tracks.

## Non-goals
- No API-generated content. No desktop packaging. No Spring Boot in the core path.
- No deletion of old topic files until their rewrite exists (folder has no git history).

## Anti-goals
- A wall of text hidden behind cards. A card over 140 words is a failure even if it validates.
- Pretty lessons with wrong numbers or code that does not run.

## Approaches considered
1. **Job path first (chosen):** DSA, then interview, then old tracks ranked by job value. Job-ready core arrives early.
2. Track by track in the old order: more complete on old material sooner, DSA and interview last.
3. Auto-convert old topics by script: fast, but reproduces the density you rejected.

## Design
- **Structure:** `content/outline.yaml` gains a `track` field (path, dsa, interview, then the old track names). `/learn` groups by track, then by week or section. Day counter and progress stay as built.
- **New views** (schema + `Views.tsx`), driven by a `step` slider so they animate: `array` (cells, pointers, window), `tree`, `graph`, `grid` (DP table). DSA needs these; existing views cannot show a pointer moving.
- **DSA track (about 30 lessons):** complexity, arrays, hashing, two pointers, sliding window, stacks and queues, linked lists, binary search, sorting, recursion, trees, BST, heaps, graphs (BFS, DFS, shortest path, topological sort), union-find, tries, DP (1D, 2D, knapsack), backtracking, greedy, intervals, bit tricks. Each: pattern, step-through, code, 3 practice problems.
- **Interview track (about 20 lessons):** behavioural stories, resume walkthrough, ML fundamentals Q&A, LLM and RAG Q&A, ML system design, backend system design, take-home and live-coding habits, negotiation. The existing mock interview stays and links in.
- **Old tracks:** each old topic becomes one to three lessons, merged where it overlaps the 44 existing ones. Order by job value: transformers and LLM engineering, deep learning, core ML, system design, distributed, build, vision, audio.
- **Home and nav (batch 0):** home becomes the learning path; Learn is the first nav item; old curriculum is reachable under "Deep dives" until replaced.
- **Validator:** keep current rules; add the jargon check (a term used before it is explained fails).

## Batches
0. Home and nav restructure, `track` field, grouped `/learn`.
1. New views plus 30 DSA lessons.
2. 20 interview lessons.
3. Old tracks, ranked, in batches of about 15 lessons.
4. Retire the old topic pages once covered.

## Left to the builder
Exact lesson lists per batch; card counts per lesson; view styling.
