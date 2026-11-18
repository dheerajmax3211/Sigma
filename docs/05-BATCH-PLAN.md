# Batch plan: status

All batches are done. Content is hand-written (no generator), checked by `pnpm tsx scripts/validate-decks.ts` and `pnpm test`.

| Batch | What | State |
|---|---|---|
| 0-3 | Home, nav, tracks; DSA (29 lessons); interview (20); rewrites of the old 101 topics into decks (`tr-`, `dist-`, `au-`, `vis-`, `dl-`, `ml-`, `fd-`, `sd-`) | done |
| Practice | A `practice` card (editor + sandbox tests) in 75 decks (97 cards in total) | done |
| Path | 47 lessons in outline order, weeks 1-7, includes pandas-basics, pytest-and-ci, fastapi-backend, cloud-deploy | done |
| Capstone | DocChat in 4 stages, weeks 4-7 (`capstone-1..4`) | done |
| Build projects | 6 guided builds: mini-transformer, lora-engine, paged-attention, diffusion-sampler, rag-system, agent-harness | done |
| 4 (retire) | Old `/topic/<id>` pages redirect (308) to `/learn/<deck>` using `content/redirects.yaml`; old YAML files are kept | done |

## Rules for new lessons
- Add `content/decks/<id>.yaml` and a row in `content/outline.yaml` (insert before the next `- { id:` line).
- Path decks use `order` 1-47 in outline order; capstones 1101-1104; builds 1201-1206.
- Run the validator, the tests, then `pnpm build` (the standalone server holds its own copy of `content/`).

## Not covered
- Path lessons whose code needs pandas, FastAPI, pytest or cloud tools show that code in `code` cards that are not executed by tests. Their `practice` cards use pure-Python logic only.
- Old topic files stay on disk. Delete them once nobody needs the fallback.
