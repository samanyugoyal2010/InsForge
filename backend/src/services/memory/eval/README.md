# Memory recall eval harness

On-demand evaluation for `MemoryService.recall()` hybrid RRF retrieval.

This is **Phase 1–2** of [InsForge#1908](https://github.com/InsForge/InsForge/issues/1908): a fixture
corpus plus a scoring script, with **injectable** embed model and default recall threshold so
sweeps do not require a source edit. It does **not** change hybrid RRF retrieval, and it is
**not** wired into CI (embedding calls need a live OpenRouter-backed stack and cost money).

Corpus and harness design adapted from
[ssrajadh/insforge-memory-lab](https://github.com/ssrajadh/insforge-memory-lab) (Apache-2.0).

## Why this exists

`DEFAULT_RECALL_THRESHOLD` in `memory.service.ts` cites an offline eval that was not previously in
the tree. Cosine similarity distributions are not comparable across embedding models, so swapping
`EMBED_MODEL` silently invalidates the constant. Quiet failure mode: recall still returns results,
just fewer correct ones.

This harness lets you re-measure precision / recall / F1 / MRR across thresholds, and isolate each
RRF arm through the public API (no DB access, no service patches).

## Layout

```
eval/
  client.mjs              thin /api/memory HTTP client (API key auth)
  score.mjs               pure precision / recall / F1 / MRR helpers
  harness.mjs             seed · sweep · report
  calibrate.mjs           cosine distribution of correct answers
  fixtures/corpus.json    28 memories + 18 labeled queries
  results/                sweep outputs
                          — baseline-limit5.json is a checked-in aggregates-only reference
                          — live sweeps write results-<scope>-limit<K>.json with per-query detail
```

## Prerequisites

1. Local InsForge stack running (`docker compose up -d` from the repo root).
2. Model Gateway / OpenRouter configured so embeddings succeed.
3. Env for the harness:

```bash
export INSFORGE_URL=http://localhost:7130
export INSFORGE_API_KEY=<project API key>   # GET /api/metadata/api-key
```

## Commands

From this directory:

```bash
node harness.mjs seed    --scope=eval
node harness.mjs sweep   --scope=eval --limit=5
node harness.mjs report  --in results/baseline-limit5.json
node calibrate.mjs       --scope=eval
```

Or from `backend/`:

```bash
npm run memory:eval:seed
npm run memory:eval:sweep
npm run memory:eval:calibrate
```

Optional flags:

- `--thresholds=0.35,0.4,0.45,1.0` — per-request vector-arm sweep (no server restart)
- `--limit=3` — change recall `limit` (compare with care; MRR is the cross-limit metric)
- `--embed-model=openai/text-embedding-3-large` — reminder only; set `MEMORY_EMBED_MODEL` on the stack, restart, and re-seed

## Injectable knobs (Phase 2)

The HTTP API already accepts per-request `threshold`. The **default** floor and the embedder used
for writes and queries are process env on InsForge (documented in `.env.example`):

| Env | Default | Notes |
|---|---|---|
| `MEMORY_EMBED_MODEL` | `openai/text-embedding-3-small` | Used for both remember() and recall(). Re-seed after changing. |
| `MEMORY_EMBED_DIMENSIONS` | `1536` | Must match the model. |
| `MEMORY_RECALL_THRESHOLD` | `0.45` | Used when a recall request omits `threshold`. |

Cosine distributions are not comparable across embedding models. Mixing two models in one scope
silently returns junk rankings.

## Arm isolation trick

`threshold` on `recallRequestSchema` gates **only** the vector arm
(`1 - (embedding <=> qv) > $threshold`). Cosine similarity never exceeds 1.0, so
`threshold: 1.0` makes that predicate unsatisfiable: the vector arm matches nothing and the
response is the keyword arm alone. Subtracting the `threshold: 1.0` row from any other row gives
exactly what the vector arm contributed.

## Interpreting results

- Macro-average over **positive** queries only.
- **Negative** queries report `noise` = mean results returned when the right answer is none.
- `threshold 1.0` is keyword-only; compare it to the shipped default row for vector lift.
- Changing `DEFAULT_RECALL_THRESHOLD` / `MEMORY_RECALL_THRESHOLD` from the shipped default is a
  separate decision (Phase 3 in #1908).

## Unit tests

Pure scoring helpers are covered by `backend/tests/unit/memory-eval-score.test.ts` (no network).
Corpus integrity is checked in the same file. Live sweeps are manual.
