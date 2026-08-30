# Build-in-public communication framework

The communication system publishes one evidence-backed research event to all
professional and social channels without rewriting the facts independently.

## Canonical content object

Each release creates `content/<date>-<slug>/` containing:

- `source.md`: the long-form technical note and exact claim boundaries;
- `evidence.json`: benchmark SHA, commands, metrics, logs and links;
- `issues.md`: public issue records created or updated under `issues/`;
- `adapters/`: channel-specific renderings;
- `status.json`: draft, reviewed, scheduled, published, corrected.

## Channel adapters

| Channel | Format | Purpose |
|---|---|---|
| GitHub | release, issue, evidence links | durable technical record |
| LinkedIn | 5–8 paragraph narrative | professional reach and lessons |
| X/Bluesky | short thread | rapid technical discovery |
| Hacker News/Reddit | neutral case study | peer critique |
| Tech press | concise pitch + primary links | external visibility |
| Blog/ai-architect.tools | full methodology and results | canonical explanation |

Adapters may change length and tone, never the metric, uncertainty, or source.
No automated posting is enabled by this repository; a human reviews and
authorizes publication for every channel.

## Publication cadence and quality gates

1. Draft from a completed benchmark or a source-backed issue.
2. Verify every number and link against the artifact manifest.
3. Run a security/privacy scrub for secrets, private paths and unapproved data.
4. Obtain independent review for claims that compare products.
5. Publish the canonical note first, then adapters in the same release window.
6. Record corrections publicly; never silently edit a published result.

## Sovereignty principle

Prefer local, versioned, self-hosted publishing primitives. External scheduling
or analytics services are optional adapters and must not become dependencies of
the benchmark or hold its canonical evidence.
