# HC-AIASPEC-010 — Versioned codebase MCP contract

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `integration`
- Subject: `versioned-codebase-contract`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: WHOLE-STACK-PARITY.md — Experimental rule
- Sovereignty dimensions: 3, 4, 6, 9

## Observed condition

The pinned ecosystem client carries handwritten codebase tool names and request
shapes and references a developer-local notes location. It does not consume a
versioned machine-readable contract. The current codebase release publishes
`mcp-contract.json`, creating an available source for contract pinning.

## Falsifiable hypothesis

An upstream tool rename or request/response schema change can pass repository-
local compilation yet fail only at runtime, and a clean checkout cannot verify
compatibility without local developer context.

## Why it matters

Cross-repository contracts are a sovereignty and reliability boundary.
Unversioned assumptions make releases depend on hidden local state and prevent
deterministic provider/host composition.

## Non-claims

The observed source does not prove that every current handwritten request is
incompatible. This dossier does not prescribe a code generator or require the
two repositories to share a release cadence.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Pin the spec release, codebase release, and codebase
  `mcp-contract.json` by SHA and content hash in a clean environment with no
  developer-local files.
- Validate every consumed tool name and request/response schema against the
  pinned contract, then execute `tools/list` and one positive plus one invalid
  call per consumed surface through isolated Claude and Codex adapters.
- Create a mutated contract fixture for rename, required-field, response-shape,
  server-identity, and schema-version drift. Use the pinned contract validator
  plus actual server response as independent oracles.
- Preserve contracts, dependency manifest, validation output, raw MCP frames,
  errors, environment data, and hashes under `results/<protocol-id>/raw/`.
- Freeze repetitions and stop rule. Unknown schema versions and unavailable
  contracts fail explicitly; they cannot fall back to local notes.

## Acceptance criteria

- The spec adapter declares and consumes one machine-readable codebase contract
  pinned by release/SHA/hash, covering server identity, tool names, and request
  and response schemas.
- Clean build and CI require no absolute developer path or unversioned local
  document to establish compatibility.
- Every drift fixture fails before a production pipeline call with a stable
  diagnostic naming the incompatible contract element; compatible contracts
  pass the live handshake and calls.
- Contract validation and live behavior agree separately on Claude and Codex,
  with immutable evidence sufficient for independent replay.

## Regression obligation

Run the smallest baseline-reproducing contract-validation and handshake fixture
after either repository changes its MCP schema or identity. A schema-version or
adapter surface change requires the full live integration matrix.

## Evidence

- [Pinned ecosystem client](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/ecosystem-adapters/src/clients/ai-architect-codebase-client.ts)
- [Published codebase MCP contract](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/mcp-contract.json)
- [Whole-stack parity rule](../../../WHOLE-STACK-PARITY.md)

## Dependencies and exclusions

Depends on stable publication of the codebase contract and an independent
contract validator. Backward compatibility across unspecified pre-contract
releases and non-codebase ecosystem contracts are excluded.

## Verdict ledger

- Pinned-source contract observation: `proven`
- Clean-checkout drift reproduction: `pending`
- Independent contract/live oracle: `pending`
- Cross-host regression: `pending`
