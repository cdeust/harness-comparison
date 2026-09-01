# Preregistered benchmark protocols

Files in this directory are immutable research contracts, not result reports.
A main run may start only after all of the following are true:

1. the protocol and the validator that accepts it are committed and available
   from the public repository;
2. the execution checkout is clean and contains that commit;
3. the release manifest records the exact protocol bytes, SHA-256 digest and
   containing Git revision before the first cell starts;
4. every cell and raw event repeats the same protocol digest.

A pilot may precede a main protocol only when it is labelled `PILOT`, stored in
a separate release, and excluded from scoring. Pilot observations may justify
the later resource envelope or workload size, but the final choices and their
sources must be written here before any scored cell.

Corrections never rewrite a protocol that has an execution attempt. Create a
new protocol ID and state the deviation. Hashes make later mutation detectable;
the earlier public Git revision supplies the external registration anchor.

Protocol preflight and release validation:

```sh
node scripts/validate-benchmark-release.mjs \
  --phase protocol protocols/<protocol>.json

node scripts/validate-benchmark-release.mjs artifacts/<release>
```

The normative research gates remain in
[`RESEARCH-PROCESS.md`](../RESEARCH-PROCESS.md).

For HC-CORTEX-002 specifically, the exact operational commands (protocol
validation, PostgreSQL reference-service lifecycle, runner bindings,
independent analysis, sealing, deep verification, and generic release
discovery) live in [`HC-CORTEX-002-RUNBOOK.md`](HC-CORTEX-002-RUNBOOK.md).
