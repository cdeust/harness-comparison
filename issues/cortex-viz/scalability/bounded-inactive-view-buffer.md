# HC-CORTEX-VIZ-004 — Bounded inactive-view buffer

- Project: `cdeust/cortex-viz`
- Category: `scalability`
- Subject: `bounded-inactive-view-buffer`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `77037021ac27864a95fec23fc957c1553b2aa884`
- Research rule: `RESEARCH-PROCESS.md` §5a; `BENCHMARK-PROCESS.md` steps 4–6
- Sovereignty dimensions: 3, 6, 7

## Observed condition

The browser activity client appends incoming graph events to an array while the
graph view is inactive. The pinned code does not bound, coalesce or spill that
array, and only flushes it when the Galaxy view becomes active.

## Falsifiable hypothesis

A sustained event stream while another view is open causes browser memory and
activation delay to grow with event count, without a visible drop or resync
signal.

## Why it matters

An operational dashboard must remain usable during the very workloads it is
meant to observe and must disclose when it cannot retain an exact live history.

## Non-claims

This does not infer a safe buffer size, event rate or browser memory budget.
Dropping, coalescing, snapshotting and durable replay remain admissible if the
selected policy is preregistered and observable.

## Reproduction protocol

Load the production UI on a non-graph view. Run a baseline stream followed by
event-rate, duration and payload levels preregistered before execution. From the
repository root, invoke
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`,
then activate the graph and
disconnect/reconnect. A browser-side independent oracle records heap, buffer
depth, rendered identities, resyncs and long tasks against the durable event
ledger. Preserve browser profiles, network traces and metrics under
`artifacts/<release>/issues/HC-CORTEX-VIZ-004/raw/`. Stop at the resource bound
in the environment manifest, browser termination or silent identity drift.

## Acceptance criteria

- Inactive-view memory and pending work remain within the resource policy
  preregistered before the run; the implementation publishes its current
  buffer/spill depth.
- Any coalesced, dropped or expired event increments an observable counter and
  triggers a declared snapshot or replay path rather than silent omission.
- Activating the graph and reconnecting converge to the durable oracle state,
  with duplicates and gaps reported independently.
- Every workload level publishes throughput, p50/p95/p99 event-to-render
  latency, queueing, retries, CPU, memory, disk, connections and recovery time.
- The baseline remains functionally identical after the bounding policy is
  enabled.

## Regression obligation

The smallest baseline-reproducing inactive-view workload is mandatory after
activity-client changes. Buffer-policy or transport changes require the full
preregistered browser workload matrix.

## Evidence

- [Inactive-view event buffering](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/ui/unified/js/activity_stream.js)
- [Browser activity transport](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/http_standalone_activity.py)

## Dependencies and exclusions

Requires a pinned browser version, durable event oracle and captured resource
policy. Server fan-out scalability and rendering aesthetics are separate.

## Verdict ledger

- Unbounded inactive-view array in source: `proven`
- Browser workload reproduction: `pending`
- Independent heap/event oracle: `pending`
- Regression: `pending`
