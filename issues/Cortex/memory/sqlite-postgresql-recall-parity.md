# HC-CORTEX-003 — SQLite and PostgreSQL recall parity

- Project: `cdeust/Cortex`
- Category: `memory`
- Subject: `sqlite-postgresql-recall-parity`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `BENCHMARK-PROCESS.md` steps 4–6
- Sovereignty dimensions: 3, 5, 6

## Observed condition

SQLite omits `value`, `source`, `source_attribution` and
`emotional_valence` from ranked results. Its heat and recency pools filter on
`heat_base` and do not exclude `post_tool_capture`, while PostgreSQL uses
`effective_heat` and excludes that source from those signals.

## Falsifiable hypothesis

The same frozen memories and query can produce different candidate membership,
metadata-dependent stages and final ranking solely because the local backend
changed.

## Why it matters

The zero-configuration local path cannot be considered a sovereign substitute
if it silently changes retrieval semantics and critical-reasoning inputs.

## Non-claims

This does not claim byte-identical database internals or equal latency. It does
not assume every post-ranking mechanism must change every fixture.

## Reproduction protocol

Seed identical SQLite and PostgreSQL stores with aged rows, controlled
`value`, provenance, valence and auto-capture fields. Freeze time and embedding
inputs. Execute the same recall prompts and mechanism ablations through fresh
processes. From the repository root, invoke the preregistered cell with
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`.
An independent candidate/rank oracle compares both outputs to the frozen
expected ledger. Preserve seed
hashes, raw tool results, candidate-stage ledgers and independent rank scores
under `artifacts/<release>/issues/HC-CORTEX-003/raw/`. Stop on seed/hash drift or
after the preregistered repetitions.

## Acceptance criteria

- Public result schemas contain the same semantically meaningful fields on both
  backends, with no trusted provenance fabricated from a missing value.
- Candidate membership and ordered IDs match the frozen oracle for heat,
  recency and final recall cells on both backends.
- The `min_heat` fixture is evaluated against the same effective-heat policy,
  and auto-captured rows follow the same documented inclusion policy.
- Ablations demonstrate that value and source-monitoring stages consume the
  seeded fields when their gates are active.
- An independent scorer publishes per-candidate differences instead of hiding
  them behind an aggregate score.

## Regression obligation

Run the frozen backend-parity fixture after every recall query, schema or
ranking change. A changed retrieval contract requires the full matched memory
matrix.

## Evidence

- [SQLite ranked result and signal construction](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/sqlite_store_search.py)
- [PostgreSQL effective-heat and source filters](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/pg_schema.py)
- [Metadata-dependent recall stages](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/core/recall_pipeline.py)

## Dependencies and exclusions

Requires identical embedding artifacts and a frozen clock. Performance parity
and semantic-projection UI are separate questions.

## Verdict ledger

- Source-level field divergence: `proven`
- Source-level ranking divergence: `proven`
- Matched backend execution: `pending`
- Regression: `pending`
