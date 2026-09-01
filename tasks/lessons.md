# Method lessons

These rules capture corrections that must remain true in later capstone cycles.

1. The versioned research contract in this repository is normative. Historical
   memory, old benchmark output and tracker state may suggest a hypothesis, but
   they cannot establish a current finding.
2. Classify the experimental unit before comparison. A complete harness runs as
   its own unit; a portable layer or subsystem must pass host-specific adapter
   gates and cannot inherit a whole-stack claim.
3. A repository README is a source of candidate claims, not runtime evidence.
   Promotion requires a clean, pinned handshake and immutable artifacts.
4. Internal AI Architect components form one product population when maturity
   or sovereignty is scored. They are not separate market competitors.
5. Never invent workload levels, timeouts, pass thresholds or score weights.
   Preregister them from cited research or measured pilot evidence.
6. Preserve negative evidence. Unsupported, unavailable and failed behavior is
   reported explicitly rather than repaired through silent substitution.
7. Public dossiers contain only current, checkable source and reproducible
   acceptance signals; private paths and private provenance stay out.
8. Repository-wide validators must enumerate tracked files plus untracked,
   non-ignored source. A raw filesystem walk lets ignored runtime caches
   contaminate deterministic results; regressions must prove both exclusion of
   ignored files and coverage of non-ignored new files.
9. A release manifest cannot prove its own preregistration. Bind the exact
   protocol bytes to an externally inspectable Git object, and adversarially
   test post-hoc rewrites, empty published releases and malformed structures.
10. A green development smoke is not benchmark evidence when its scheduler,
    recovery probe or telemetry boundary differs from the preregistered
    contract. Preserve it as engineering feedback, correct the adapter, and
    rerun from a fresh unscored attempt.
11. A treatment-sensitive predicate is never an evidence-validity gate. The
    first scored HC-CORTEX-002 run (2026-09-01) was unanalyzable because the
    analyzer rejected the RED control's ledger for recording zero fault
    retries — the very behaviour the control exists to exhibit. Keep the
    structural bound (protocol `retryPolicy`) in ledger validation and leave
    the count to the oracle check; and make every synthetic fixture mirror the
    real negative control, otherwise a green suite proves nothing about RED.
12. A receipt's lifecycle status must not encode an exit-code judgement. The
    oracle exits 1 by contract to report `blocked`; the runner marked that
    receipt `failed` while classifying the cell as observed, and the analyzer
    refused it. Interpret exit codes per mode where the contract lives, and
    exercise every contractual non-zero exit in the runner suite on the
    receipt itself, not only on the summary. Because the runner binds HEAD to
    the registration (clean, pushed), a runner fix can never repair an
    existing release: commit, push, re-provision, re-execute into a fresh root
    and preserve the invalidated tree as negative evidence.
