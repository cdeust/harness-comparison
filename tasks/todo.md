# Claude-harness parity worklog (2026-09-01)

Goal: bring `claude-harness/` to parity with the solutions already implemented
in `codex-harness/`, per the capstone charter and BENCHMARK-PROCESS.md.

Check named before implementation: `node --check` on every new script,
`node claude-harness/validate.mjs` green, and a side-effect-free
`run-probes-sequential.mjs --dry-run` listing all cells as PENDING.

## Plan

- [x] Add the six missing benchmark prompts (ingest-a/b, probe-a/b,
  components-a/b), Claude-adapted (Read/Grep/Bash prohibition, plugin-based
  Harness B, `{{PLACEHOLDER}}` outputs).
- [x] Add `run-b-ingestion-unbounded.mjs` — direct-stdio AI Architect driver
  resolving the server from the isolated Harness B plugin config, not a
  hardcoded binary path.
- [x] Add `run-probes-sequential.mjs` — sequential no-overwrite cell runner
  with environment brackets, git snapshots, staged reports, full report-schema
  validation on skip (lesson 4353667), and a pre-spawn attempt ledger so a
  crashed orchestrator leaves an indeterminate record, never silence
  (lesson 4353868).
- [x] Extend `validate.mjs` with static gates for the new runners.
- [x] Update `claude-harness/README.md`; reference `../BENCHMARK-PROCESS.md`
  (no third copy of the revision contract — codex's own copy is already
  flagged for dedup).
- [x] Run the named checks and record the outcome here.

## Review

- Legacy inventory: 118 records, with the complete disposition table in
  [`issues/AUDIT.md`](../issues/AUDIT.md).
- Active product work: 42 consolidated dossiers across the five-project AI
  Architect population.
- Benchmark and study work: 13 dossiers, including separate ECC and DeepSeek
  Harness inclusion pilots.
- Automated gate: 55 unique dossiers and 2 candidate cards; both host isolation
  validators pass.
- Publication status: source audit complete; runtime reproduction, matched
  comparison and independent scoring remain explicitly `pending`.

## Registry validator follow-up

- [x] Reproduce the ignored-runtime false-positive on merged `main`.
- [x] Add a regression proving ignored Markdown is excluded.
- [x] Prove untracked, non-ignored Markdown remains covered.
- [x] Make repository-wide Markdown discovery honor the Git source boundary.
- [x] Run the registry, host-isolation, privacy and diff gates.
- [ ] Publish the correction through a dedicated pull request.

### Validator review

- Before: 201 false link failures from 636 ignored third-party Markdown files
  under `codex-harness/runtime/` on the merged checkout.
- Regression: ignored broken Markdown leaves the validator green; untracked,
  non-ignored broken Markdown still fails and is named in stderr.
- After: the registry reports 55 valid dossiers and 2 candidate cards; both
  host-isolation validators and the diff/privacy gates pass.
- Independent read-only review found no merge blocker and confirmed that
  NUL-delimited `git ls-files` plus `execFileSync` avoids shell and platform
  quoting differences. A tracked file missing from a sparse or unstaged
  worktree can still produce an unhandled read error; controlled diagnostics
  for that separate edge remain future hardening.

## HC-CORTEX-002 — transaction-isolation benchmark

WIP handoff: [`HC-CORTEX-002-HANDOFF.md`](HC-CORTEX-002-HANDOFF.md). Resume
from that file before changing or running the protocol.

- [x] Reproduce the shared-connection failure on the pinned Cortex baseline.
- [x] Implement and independently review request-scoped SQLite transaction
  isolation in the Cortex candidate branch.
- [ ] Seal a dated protocol before executing any benchmark cell, including the
  candidate SHA, PostgreSQL reference, ladder derivation, operation ledger,
  stop rules, metrics, repetitions and non-claims.
- [ ] Add the smallest reusable preregistration and artifact-integrity gate
  needed to reject incomplete or mutated result releases.
- [ ] Add a protocol-driven workload adapter that executes every declared cell
  in a fresh process and emits one common raw-event and metric schema.
- [ ] Freeze the independent aggregation/scoring code and the manifest sealer
  before any scored cell so analysis choices cannot follow the observed data.
- [ ] Run the validator fixtures and one unscored smoke cell; independently
  review the protocol and runner before the main run.
- [ ] Execute two clean SQLite runs and the matched PostgreSQL reference cells,
  preserving restart/recovery and store-integrity oracles.
- [ ] Analyze the immutable artifacts, update the public Cortex dossier only
  from observed evidence, and publish through a dedicated pull request.

### HC-CORTEX-002 review

- Cortex baseline: `8f5ae3b87b6969f3abcb3736859febfdab69304a`.
- Cortex candidate: `9faa80d3` in draft PR `cdeust/Cortex#452`.
- Candidate regression status: focused, affected and full local suites pass;
  draft PR `cdeust/Cortex#452` is green on remote CI.
- Adapter smoke status: the first C1/C2 implementation smokes were invalidated
  before scoring because they used a write recovery probe, an eager task
  backlog, the wrong queue boundary and no peak-connection observation. They
  are development evidence only and will not enter a benchmark release.
- Corrected development smokes remain unscored: the pinned baseline C2/W1
  produced the expected blocked oracle, while candidate C5/W100 produced a
  proven oracle with `301 = 3W + 1` measured terminal operations, five actual
  dispatcher requests in flight and one request observed at the source
  admission queue. Their temporary trees are excluded from publication.
- Cross-contract review prevented two post-hoc repairs: the runner now emits a
  unique attempt ID per cell rather than one release-wide ID, and persists the
  complete external Git protocol registration required by the sealer.
- PostgreSQL is still `unverified` for scoring purposes: the protocol
  requires an owner-only Unix socket, no TCP listener, rejected host
  authentication and one fresh `template0` database per PostgreSQL cell.
  A real macOS PostgreSQL 17.9 (Homebrew) prepare/status/stop smoke against
  the registered protocol completed (see below); Linux remains untested.
- Benchmark status: `pending`. No workload or PostgreSQL result is publishable
  until the protocol hash and artifact validator are sealed.

### HC-CORTEX-002 review (2026-09-01 continuation, commit `93070fe`)

Handoff items 1-4 from `HC-CORTEX-002-HANDOFF.md`'s incomplete-work list are
now complete. Item 5 (independent release review, then the harness
preregistration PR) is complete as of the next dated entry below.
`registeredAt` is now frozen. Exact commands: [`protocols/HC-CORTEX-002-RUNBOOK.md`](../protocols/HC-CORTEX-002-RUNBOOK.md).

- Item 1 (persisted-state recomputation): `persistedState()` was implemented
  but never wired into `validateOracleLedger`'s context, so every check
  depending on it crashed. Wired it in, added a marker-derived-vs-formula
  cross-check, and rewrote `load_window_exact` to independently recompute
  BigInt arithmetic, load-window enclosure, and the producer's
  `summary_elapsed_ns`/`load_intent_count`/`load_outcome_count` fields
  against raw ledger data rather than trusting `expected` prose. Rebuilt the
  analysis fixtures with a coherent row/marker/edge story and raw causal
  corruption in the blocked-baseline control (not merely a false check).
- Item 2 (discovery path fix): `validate-benchmark-release.mjs`'s
  `withIssueSpecificVerification` hardcoded `<release>/protocol.json`; the
  generic manifest contract only guarantees `manifest.protocol.path`. Fixed
  to derive the path from the already-validated manifest with a quiescence
  check; regression-tested against a nonstandard path.
- Item 3 (real E2E): first test in the repository to chain the real runner
  into the real Python adapter (pinned candidate `9faa80d3`) and the
  analyzer/sealer/verifier chain (`scripts/hc-cortex-002-real-adapter-e2e.test.mjs`),
  on a disposable SQLite C1/W1 fixture. Surfaced and fixed two previously
  latent integration defects no synthetic fixture had exercised: the privacy
  scanner false-positived on raw binary SQLite evidence (treated it as UTF-8
  text), and the analyzer's provenance validator rejected the real runner's
  own `gitBlob` field. A real PostgreSQL 17.9 smoke (prepare/status/stop, no
  fakes) completed on macOS; Linux is untested on this host. Extended the
  read-only verifier's adversarial coverage to analysis, negative evidence,
  and manifest-projection forgery (previously only scoring was covered).
- Item 4 (documentation): added `protocols/HC-CORTEX-002-RUNBOOK.md` with
  every exact command, including the PostgreSQL provisioner's git-registration
  gotcha (needs a pushed commit, not merely a committed one); added
  `.gitattributes`; updated the Cortex issue dossier's engineering-readiness
  note without upgrading any verdict-ledger row; documented the sealer's
  hardcoded `protocol.json` limitation as a known limitation, not refactored.
- Known limitation carried forward, not fixed here: `hc-cortex-002-seal-lib.mjs`
  hardcodes the literal `"protocol.json"` path, so a fully-verified-positive
  HC-CORTEX-002 release at a nonstandard protocol path is architecturally
  impossible with this pipeline's own tooling today (see the runbook §8).

### HC-CORTEX-002 review (2026-09-01, item 5 — freeze and preregistration PR)

Independent release review returned `RELEASE-REVIEW: APPROVE` at `de80178`
(all suites re-executed by the reviewer, persisted-state wiring confirmed at
source, no seal-clean forgery path found).

- Added a one-line derivation comment at the two `expectedLive = 3N+1` sites
  in `scripts/hc-cortex-002-analysis-lib.mjs` (a reviewer-suggested,
  non-obvious cross-file constraint from the adapter's `2N+1` seed formula).
- Froze `protocols/2026-08-30-hc-cortex-002-v1.json`'s `registeredAt` at
  `2026-09-01T17:31:11Z` and recorded every prior pilot/smoke as a
  `declaredDeviations` entry: the pre-freeze C1/C2 tooling pilots, the
  corrected baseline C2/W1 and candidate C5/W100 smokes, and the PostgreSQL
  C1/W1 producer-to-oracle smoke. None selected a registered parameter after
  the fact.
- Opened the preregistration PR, `wip/hc-cortex-002-capstone-protocol` →
  `main`. Not merged; the coordinator handles CI, freeze-delta
  re-verification, and the merge decision. No scored cell was run.

### HC-CORTEX-002 review (2026-09-01, first scored execution)

Check named before acting: `analyze-hc-cortex-002.mjs` exit 0 on the release
root, then `seal --status VERIFIED`, `verify-hc-cortex-002-release.mjs` and
`validate-benchmark-release.mjs` all exit 0, plus every suite green.

- [x] Execute the frozen 18-cell matrix from merged `main` (`dc53c6f`) into
  `hc-cortex-002-release-20260901`: runner exit 0, 18/18 `passed`, 17
  `proven`, baseline `blocked` as preregistered.
- [x] Analyze it — **refused by the analyzer at the RED control**
  (`RETRY_CHOREOGRAPHY_INVALID`, then `PROCESS_RECEIPT_INCOMPLETE`). Root
  causes and fixes: runbook §9, lessons 11-12, commit `baecc89`. The first
  tree is preserved unsealed as negative engineering evidence.
- [x] Re-execute from the pushed fix (`baecc89`) with a fresh PostgreSQL
  root into `hc-cortex-002-release-20260901-r2`: runner exit 0
  (20:35:01Z–20:41:35Z), 18/18 `passed`, 17 `proven`, baseline `blocked`.
  Its first analysis exposed a third, analyzer-only defect
  (`PROCESS_BINDING_INVALID`: strict-equality comparison of the structured
  PostgreSQL service binding, never reached by a fixture), fixed in
  `3cfef16` with a fixture that now attempts a PostgreSQL cell and a
  regression test confirmed red on the pre-fix analyzer (runbook §9.1,
  lesson 13). The raw evidence was untouched; no third execution.
- [x] Analyze, seal `VERIFIED`, deep-verify and generically validate the
  second release: analysis valid (18 cells, study verdict `PASS`), seal
  `VERIFIED` (203 artifacts), verification valid (raw-input set
  `8e1a3579…f762`, byte-exact recomputation), generic validation valid,
  discovery over `artifacts/` valid.
- [x] Copy the sealed release under `artifacts/` and update the Cortex
  dossier from `scoring/scoring.json` only.
- [x] Publish through a dedicated pull request (CI green, independent review,
  merge commit so the registration stays reachable): PR #5, review verdict
  recorded on the PR, merged by merge commit `ad7047e` on 2026-09-02.
- [x] Decide `cdeust/Cortex#452` from the sealed evidence: readiness decision
  posted from `scoring/scoring.json` only, PR moved from draft to
  ready-for-review on 2026-09-02 (merge still needs its own review there).

Host conditions (recorded in the runner's per-cell host snapshots and the
session condition log): macOS, 10 cores, 1-minute load 5.70 at launch and
6.58 after the run, 42 GiB free before and after; a peer session ran light
`node --test`/`npm ci` bursts during the window, never a sustained build or
benchmark.

Issue candidates (pre-existing, not worsened in kind by this delivery):
`scripts/hc-cortex-002-analysis.test.mjs` (1624 lines) and
`scripts/hc-cortex-002-analysis-lib.mjs` (1622 lines) exceed the 500-line
file cap; splitting them along fixture/assertion and evidence/scoring seams
is separate work.

## Claude-harness parity worklog review (2026-09-01)

- `node --check` passed on all three scripts; `node claude-harness/validate.mjs`
  and `node codex-harness/validate.mjs` both report valid; issue registry
  reports PROVEN (55 dossiers, 2 candidate cards).
- `run-probes-sequential.mjs --dry-run` (result root pointed at a scratch
  directory) lists all 12 cells PENDING with no repository side effects.
- Plugin-server resolution smoke test: the driver resolves
  `ai-architect-mcp-codebase@…` → `.claude-plugin/plugin.json` → `.mcp.json`
  → an existing `bin/launch-plugin.sh` in the pinned 0.11.1 install.
- Deliberate deviations from the codex runner, both documented in the README:
  symmetric five-repository A/B coverage (codex's A-side slice was a
  run-specific artifact), and a `CLAUDE_HARNESS_RESULT_ROOT` override instead
  of a dated hardcoded result root.
- No benchmark cell was executed — runners are operator-launched only, after
  the environment gate, per BENCHMARK-PROCESS.md.

## Trois chantiers 2026-09-02 — plan soumis à l'owner (aucune implémentation)

Directive owner du 2026-09-02 (mémoire Cortex 4355799) : (A) ledger de
frugalité mesurée, (B) protocole v2 auto-memory vs Cortex à 10^2..10^5 items
avec axe fraîcheur, (C) bras Zikkaron. Sources vérifiées : mémoires 4355837
(Zikkaron, auto-memory) et le rapport frugalité du même jour ; inventaire
du dépôt (agent Explore, 19:38Z). Ordre proposé : A avant B, C comme bras
de B. Le ledger est l'instrument que les deux autres chantiers lisent.

### Constats qui bornent les trois chantiers

- Aucune télémétrie de tokens n'existe dans le dépôt : le coût est un
  placeholder déclaré à zéro (`adapters/hc-cortex-002/hc_cortex_002/provenance.py:19-24`,
  `scripts/hc-cortex-002-analysis-lib.mjs:966`). Pourtant
  `claude-harness/run-isolated.mjs:76-85` lance déjà `claude -p
  --output-format json` mais avec `stdio: "inherit"` : l'enveloppe JSON
  (usage et coût) est affichée puis perdue. Le ledger commence par capturer
  ce flux, pas par inventer un compteur.
- Aucun bras témoin sans mémoire : `cortex-baseline` est une révision
  antérieure de Cortex, pas une exploration fichier par fichier.
- Aucun générateur de corpus : le seul axe de taille est
  `operationsPerType ∈ {1,100}` (`protocols/2026-08-30-hc-cortex-002-v1.json:376-381`).
- Énergie et CO2e : zéro occurrence dans le dépôt.
- La preuve de fraîcheur (Cortex servant des README vieux de 2 à 4 mois)
  vit dans `results/COMPARISON-rev2.md` au commit `da491bf`, absent de
  `main` actuel ; le protocole v2 la cite par objet git, pas par chemin.
- Deux chiffres de la directive ne survivent pas aux sources : le plafond
  « ~200 fichiers » attribué à Karpathy n'est pas dans son gist (il parle
  de « ~100 sources, ~hundreds of pages ») ; aucun chiffre « 4 000 tokens »
  de CLAUDE.md n'existe dans la documentation Anthropic. Ni l'un ni
  l'autre n'entre dans une préinscription.

### Chantier A — ledger de frugalité mesurée

Vérification nommée avant d'agir : un validateur de schéma du ledger
(`node --test`) rouge sur une entrée sans `usage`, vert sur une cellule
réelle ; l'agrégateur recalcule byte-exact la réduction et son intervalle
à partir des JSON bruts.

- [x] Capturer l'enveloppe `claude -p --output-format json` dans un fichier
  par cellule (`usage.input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`,
  `total_cost_usd`, `num_turns`, `duration_ms`) ; vérifier les noms de
  champs contre la documentation du CLI et la version installée avant
  d'écrire le schéma.
  - Champs vérifiés contre https://code.claude.com/docs/en/agent-sdk/typescript
    (type `SDKResultMessage`) et https://code.claude.com/docs/en/headless, et
    contre l'enveloppe mesurée du CLI 2.1.258 installé
    (`claude-harness/fixtures/result-envelope.claude-2.1.258.json` +
    `.provenance.json`). Livrés : `claude-harness/run-isolated.mjs`
    (`--envelope-out`, écriture create-exclusive `"wx"`),
    `claude-harness/result-envelope.mjs` (validateur pur +
    `readResultEnvelope`), `claude-harness/result-envelope.test.mjs`,
    branchés dans `claude-harness/run-probes-sequential.mjs` (un rapport
    sans enveloppe compte comme artefact partiel, jamais comme cellule
    terminée) et `claude-harness/validate.mjs`. Revue fraîche du 2026-09-02
    (REQUEST_CHANGES) corrigée dans la même PR : le validateur refuse
    `is_error: true` (mesuré sur une cellule réelle B : home isolé jamais
    connecté → `terminal_reason: "api_error"`, `modelUsage` vide),
    `readResultEnvelope` est testé (fixture, chemin absent, fichier vide,
    enveloppe invalide) et nomme le fichier illisible ; précondition
    opérateur documentée dans `claude-harness/README.md` (`/login` sous
    `CLAUDE_CONFIG_DIR=claude-harness/runtime/<a|b>/claude-home` avant
    toute cellule scorée).
- [x] Définir le bras témoin « exploration fichier par fichier » : Claude
  Code sans serveur MCP mémoire, auto-memory désactivée
  (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`), Read/Grep/Glob autorisés, mêmes
  prompts que les bras A et B ; le préinscrire comme quatrième (après
  auto-memory, Cortex, Zikkaron) `experimentalUnit`.
  - Livrés : `claude-harness/harness-c.mcp.json` (manifeste vide, clé
    `environment` nouvelle au niveau harness),
    `claude-harness/runtime/c/claude-home/{settings.json,installed_plugins.json}`,
    `claude-harness/harness-environment.mjs` (`composeIsolatedEnvironment`,
    module pur extrait de `run-isolated.mjs`) +
    `claude-harness/harness-environment.test.mjs`, `run-isolated.mjs` (accepte
    `--harness A|B|C`), `run-probes-sequential.mjs` (cellules `C-<repo>` ×5 +
    `C-components`, aucune cellule d'ingestion — exploration fichier par
    fichier par construction), les prompts `prompts/{step0-c,probe-c,
    components-c}.md` (miroir de la structure A/B), `validate.mjs` (roster
    vide de C, `environment` de C vs absence sur A/B, boucle runtime
    `["a","b","c"]`, validation du fragment `harness-c.experimental-unit.json`
    contre le schéma), `harness-c.experimental-unit.json`, et
    `claude-harness/README.md` (section « Control arm (Harness C) »).
- [ ] Ligne de précalcul dans le ledger : coût d'ingestion et d'indexation
  (secondes CPU, RSS max, tokens si un LLM intervient) publié brut et
  par tâche avec le `n` d'amortissement affiché, jamais dilué en silence.
- [ ] Schéma `frugality-ledger-v1.schema.json` + agrégateur indépendant :
  réduction relative vs témoin avec intervalle de confiance bootstrap
  percentile, `n` publié par cellule, aucune valeur seuil inventée
  (leçon 5).
- [ ] Conversion énergie/CO2e via EcoLogits 0.11.1 (MPL-2.0) :
  `E_request = PUE × E_server`, `E_GPU = #T_out × (α e^(βB) P_active + γ)`
  avec α, β, γ, B cités depuis la page méthodologie ; facteurs d'émission
  Our World in Data ; part incorporée BoaviztAPI (p5.48xlarge, 3 ans).
  Chaque constante porte `// source:`.
- [ ] Réserves d'honnêteté imprimées dans toute publication : effet rebond
  (Luccioni-Strubell-Crawford 2025, Sorrell 2009, Coroamă-Mattern 2019) ;
  énergie dominée par l'infrastructure fournisseur (nous agissons sur le
  numérateur par tâche) ; EcoLogits ne modélise pas les tokens d'entrée et
  donne des plages min/max pour les modèles fermés ; jamais « green »,
  toujours « frugalité mesurée ».
- [ ] Déclaration AFNOR SPEC 2314 : unité fonctionnelle (une tâche de
  benchmark menée au rubric), frontières (tokens d'inférence + précalcul
  local), méthode d'allocation (par requête) ; indicateurs RGESN 1.5
  couverts ou déclarés absents (eau, ressources abiotiques : absents).
- [ ] Une note de benchmark publiée depuis le ledger scellé uniquement.

### Chantier B — protocole v2 : auto-memory vs Cortex, échelle et fraîcheur

Vérification nommée : la fixture du générateur produit des corpus
déterministes (graine publiée) dont le hash est stable entre deux
exécutions ; chaque backend préinscrit passe une cellule fixture avant
toute cellule notée (leçon 13).

- [ ] Préinscription `protocols/2026-09-xx-hc-memory-scale-v2.json` copiée
  sur la forme v1 (mêmes 23 clés, `registeredAt` gelé après revue).
- [ ] Générateur de corpus 10^2, 10^3, 10^4, 10^5 items : faits synthétiques
  avec paires question/réponse de vérité terrain ; écrit l'arbre markdown
  auto-memory (index `MEMORY.md` ≤ 200 lignes / 25 Ko, fichiers de sujet
  lus à la demande) et alimente Cortex par `remember` ; un item = une
  unité définie une fois pour les deux bras (décision owner ci-dessous).
- [ ] Deux courbes par taille : rappel (taux de réponse correcte aux
  sondes) et tokens par tâche (ledger A). Le point de croisement est le
  produit ; les courbes perdantes se publient.
- [ ] Axe fraîcheur : versions périmées puis fraîches d'un même document ;
  mesurer si le contenu servi correspond à la version courante (défaut
  rev.2, `da491bf:results/COMPARISON-rev2.md`).
- [ ] Mesure headless vérifiée : `claude -p` charge l'auto-memory sauf
  `--bare` ; les écritures se mesurent par diff du répertoire mémoire.
- [ ] Non-revendications préinscrites : la consolidation « auto-dream »
  n'est pas documentée (preuve : prompt extrait ccVersion 2.1.235 et
  commentaire anthropics/claude-code#39135) ; son déclenchement, son état
  par défaut et son comportement sous `-p` ne sont pas vérifiés. Le
  protocole mesure l'arbre tel qu'écrit et, si une consolidation est
  observable, la déclare en déviation.

### Chantier C — bras Zikkaron

Vérification nommée : cellule fixture Zikkaron verte sous le contrat
adaptateur existant (`README.md:42-56`, schémas
`benchmark-protocol-v1` et `execution-manifest-v1`) avant toute cellule
notée.

- [ ] Faisabilité confirmée par les sources : `pip install zikkaron==1.6.0`
  (MIT, Python ≥ 3.11), serveur MCP stdio, une base SQLite par cellule via
  `ZIKKARON_DB_PATH`, embeddings `all-MiniLM-L6-v2` à pré-télécharger et
  hacher ; dernier commit 2026-04-01.
- [ ] Adapter `adapters/zikkaron/` : bras dans le protocole v2, mêmes
  tâches, même corpus, même ledger.
- [ ] Déclarer sans conclure : 21 des 24 noms d'outils coïncident avec
  Cortex ; les benchmarks publiés sont auto-déclarés sans intervalle ni
  graine ; aucun argument tiré des étoiles ou des téléchargements.

### Décisions qui reviennent à l'owner avant implémentation

1. `n` par cellule et méthode d'intervalle : pilote pour estimer la
   variance, puis `n` dérivé d'une demi-largeur cible déclarée, ou `n`
   fixe préinscrit.
2. Énergie pour les modèles sans entrée EcoLogits (Fable 5, Opus 5) :
   publier « aucun chiffre traçable », ou une plage sous hypothèse
   déclarée `model-arch-not-released` avec l'entrée Opus 4.x en proxy.
3. Facteur d'émission : mix mondial Our World in Data ou région déclarée.
4. Définition de l'item et origine du corpus : synthétique déterministe
   (proposé) ou dérivé de dépôts réels.
5. Zikkaron : troisième bras du v2 (proposé, un seul corpus) ou protocole
   séparé.
6. Candidats issue déjà signalés sans numéro : `scripts/hc-cortex-002-analysis-lib.mjs`
   (1622 lignes) et `scripts/hc-cortex-002-analysis.test.mjs` (1642 lignes)
   dépassent le plafond de 500 lignes ; seul l'owner ouvre les issues.

Arbitrage 2026-09-02 — l'owner délègue (« Pour les différents choix, je te
laisse prendre la meilleure option ») ; choix retenus, enregistrés Cortex
4355909-4355915 :

1. Deux étapes (Stein 1945) : pilote préinscrit pour la variance, `n`
   dérivé d'une demi-largeur cible déclarée ; intervalle bootstrap
   percentile ; `n` publié par cellule. `n` fixe rejeté (constante inventée).
2. « Aucun chiffre traçable » en tête pour Fable 5 / Opus 5 ; ledger
   tokens/coût publié car mesuré ; plage proxy en annexe seulement, marquée
   `model-arch-not-released`.
3. Mix mondial Our World in Data en tête : l'enveloppe du CLI 2.1.258
   rapporte `usage.inference_geo: "not_available"`, la région d'inférence
   n'est pas divulguée ; région en sensibilité déclarée seulement.
4. Corpus synthétique déterministe (graine et digest dans le manifeste) ;
   dépôts réels en validation externe hors courbe.
5. Zikkaron : troisième bras du v2, même corpus, mêmes tâches, même ledger.
6. Les deux candidats issue sont ouverts par délégation de l'owner : #8
   (`scripts/hc-cortex-002-analysis-lib.mjs`, 1622 l.) et #9
   (`scripts/hc-cortex-002-analysis.test.mjs`, 1642 l.) ; dette préexistante
   non aggravée, aucun refactor dans les chantiers.
