// Pure module: general-purpose statistical primitives for the
// measured-frugality ledger's independent aggregator (tasks/todo.md:325-329,
// chantier A, etape 4). No I/O, no clock, no ledger-specific vocabulary —
// this module knows nothing about harnesses, tasks, or cells; it is a
// self-contained PRNG + bootstrap toolkit, split out of
// frugality-aggregate.mjs to keep both files under the 500-line cap
// (coding-standards.md §4.1) and to keep the two concerns — "how do you
// resample and derive a confidence interval" vs "how do you read this
// ledger's shape" — separately reasoned about and separately testable
// (coding-standards.md §1.1 / Move 5).
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// PRNG: xoshiro128** (source: Blackman, D. & Vigna, S. 2021, "Scrambled
// Linear Pseudorandom Number Generators", ACM Transactions on Mathematical
// Software 47(4), art. 36; reference implementation
// https://prng.di.unimi.it/xoshiro128starstar.c, fetched and verified
// 2026-09-03 — sha256 recorded in
// fixtures/xoshiro128starstar.reference.provenance.json). The `next()`
// function below is a line-for-line port of that reference C file.
// ---------------------------------------------------------------------------

function rotl(x, k) {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

// pre: state is a 4-element array of uint32, not all zero (checked once at
//      construction by createSeededGenerator, never here: xoshiro128**'s
//      period is 2^128 - 1, so every non-zero state stays on the single
//      cycle that excludes the all-zero state — source: reference
//      implementation's period claim in its header comment).
// post: mutates state in place to the next state; returns the scrambled
//      32-bit output for the current call. Matches the reference C `next()`
//      byte for byte (verified against a compiled copy of the reference
//      file — see README "Frugality aggregator" section for the transcript).
function xoshiro128starstarNext(state) {
  const result = Math.imul(rotl(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (state[1] << 9) >>> 0;
  state[2] = (state[2] ^ state[0]) >>> 0;
  state[3] = (state[3] ^ state[1]) >>> 0;
  state[1] = (state[1] ^ state[2]) >>> 0;
  state[0] = (state[0] ^ state[3]) >>> 0;
  state[2] = (state[2] ^ t) >>> 0;
  state[3] = rotl(state[3], 11);
  return result;
}

// source: Lemire, D. 2019, "Fast Random Integer Generation in an Interval",
// ACM Transactions on Modeling and Computer Simulation 29(1), art. 3 (DOI
// 10.1145/3230636, verified via Crossref 2026-09-03 — the task brief that
// commissioned this module cited "ACM TOMS 29(1)"; the publisher record
// names the venue ACM TOMACS, volume/issue/DOI otherwise match, so this
// comment corrects the acronym rather than propagating it), Algorithm 3 "The
// OpenBSD algorithm", §3.1, p.4 of the arXiv preprint (arXiv:1805.10941v4,
// read directly 2026-09-03): with L=32, t = (2^32 - n) mod n = (2^32 mod n)
// since n <= 2^32; draw x uniformly in [0, 2^32); reject and redraw while
// x < t; return x mod n.
export function unbiasedBelow(n, drawUint32) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`unbiasedBelow: n must be an integer >= 1, got ${JSON.stringify(n)}`);
  }
  // (2^32 - n) mod n equals 2^32 mod n whenever n <= 2^32 (Lemire §3.1,
  // parenthetical note on Algorithm 3); 2**32 is exactly representable as a
  // JS double so no overflow occurs computing it this way.
  const threshold = (2 ** 32) % n;
  let x = drawUint32();
  while (x < threshold) x = drawUint32();
  return x % n;
}

// Contract:
// pre: seedString is a non-empty string.
// post: returns { nextUint32, nextBelow(n) }. Same seedString always
//       produces the same output sequence (determinism requirement — the
//       aggregator needs a reproducible interval per cell). Throws if the
//       derived state is all-zero, the reference implementation's only
//       forbidden state ("The state must be seeded so that it is not
//       everywhere zero", xoshiro128starstar.c comment).
// Exported separately so the all-zero refusal path is unit-testable without
// needing to find a seed string whose sha256 digest happens to collide with
// the all-zero state (astronomically unlikely to occur in a test's time
// budget, by design of sha256).
export function assertNonZeroState(state) {
  if (state.every((word) => word === 0)) {
    throw new Error("createSeededGenerator: sha256-derived state is all-zero (forbidden by xoshiro128**) — choose a different seed string");
  }
}

export function createSeededGenerator(seedString) {
  if (typeof seedString !== "string" || seedString === "") {
    throw new Error("createSeededGenerator: seedString must be a non-empty string");
  }
  const digest = createHash("sha256").update(seedString, "utf8").digest();
  const state = [digest.readUInt32BE(0), digest.readUInt32BE(4), digest.readUInt32BE(8), digest.readUInt32BE(12)];
  assertNonZeroState(state);
  return {
    nextUint32: () => xoshiro128starstarNext(state),
    nextBelow: (n) => unbiasedBelow(n, () => xoshiro128starstarNext(state))
  };
}

// ---------------------------------------------------------------------------
// Percentile ranks and bootstrap interval
// ---------------------------------------------------------------------------

// Tolerance for the integer-rank check below. source: IEEE 754-2008 double
// precision arithmetic has a machine epsilon of 2^-52 (~2.22e-16); computing
// (replicates + 1) * alpha / 2 accumulates rounding error from `1 -
// confidenceLevel` and the two chained operations, empirically up to ~5e-14
// for the values this module handles (measured 2026-09-03, e.g. (1999+1) *
// (1 - 0.95) / 2 = 50.00000000000004 in Node v24.7.0). 1e-9 is several
// orders of magnitude looser than that measured error while still rejecting
// any genuinely non-integer rank (the smallest meaningful gap is 0.5, for a
// replicates value one short of exact).
const RANK_INTEGER_TOLERANCE = 1e-9;

function isEffectivelyInteger(x) {
  return Math.abs(x - Math.round(x)) < RANK_INTEGER_TOLERANCE;
}

// Contract:
// pre: replicates is an integer >= 1; confidenceLevel is a number in (0, 1).
// post: returns { alpha, lowerRank, upperRank } with the rank
//       k = (replicates + 1) * alpha / 2 (1-indexed into the ascending-
//       sorted bootstrap replicates), lowerRank = k, upperRank = R+1-k.
//       Throws naming both when k is not an integer >= 1 — no interpolation
//       rule is chosen here. source: Davison, A.C., "Bootstrap Methods and
//       their Application", short-course handout (February 2021), slide 45
//       "Other confidence intervals", https://statistique.cuso.ch/fileadmin/
//       statistique/user_upload/BootShortHandout.pdf (read 2026-09-03):
//       percentile interval = (theta*_((R+1)a), theta*_((R+1)(1-a))) on the
//       ordered replicates, a being one tail's probability — hence
//       k = (R+1)(1-c)/2 for a two-sided level c; the handout's own examples
//       use R = 999. Refusing a non-integer rank is this module's consequence
//       of that formula (no interpolation rule is chosen), not a rule quoted
//       from Davison & Hinkley 1997 (Cambridge University Press, DOI
//       10.1017/cbo9780511802843), whose text was not read in-session
//       (tasks/lessons.md lesson 5: never invent what a source did not say).
export function percentileRanks({ replicates, confidenceLevel }) {
  if (!Number.isInteger(replicates) || replicates < 1) {
    throw new Error(`percentileRanks: replicates must be an integer >= 1, got ${JSON.stringify(replicates)}`);
  }
  if (typeof confidenceLevel !== "number" || !(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new Error(`percentileRanks: confidenceLevel must be a number in (0, 1), got ${JSON.stringify(confidenceLevel)}`);
  }
  const alpha = 1 - confidenceLevel;
  const kRaw = ((replicates + 1) * alpha) / 2;
  if (!isEffectivelyInteger(kRaw) || Math.round(kRaw) < 1) {
    throw new Error(
      `percentileRanks: (replicates + 1) * alpha / 2 = ${kRaw} is not an integer >= 1 ` +
        `(would give lowerRank=${kRaw}, upperRank=${replicates + 1 - kRaw}); choose a replicates ` +
        `value compatible with confidenceLevel=${confidenceLevel} (e.g. 999 or 1999 at 0.95)`
    );
  }
  const k = Math.round(kRaw);
  return { alpha, lowerRank: k, upperRank: replicates + 1 - k };
}

// Contract:
// pre: sample is a non-empty array; generator is a createSeededGenerator()
//      instance.
// post: returns a new array of the same length, each slot an independent
//      uniform draw (with replacement) from sample, consuming generator's
//      sequence.
export function resampleWithReplacement(sample, generator) {
  const n = sample.length;
  const result = new Array(n);
  for (let i = 0; i < n; i++) result[i] = sample[generator.nextBelow(n)];
  return result;
}

export function mean(values) {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

// Contract:
// pre: treatmentValues, controlValues are non-empty arrays of finite
//      numbers.
// post: returns 1 - mean(treatmentValues) / mean(controlValues). Throws
//      naming both means when mean(controlValues) === 0 — the ratio is
//      undefined, not zero or infinity; the caller decides how to report
//      that.
export function relativeReduction(treatmentValues, controlValues) {
  const meanTreatment = mean(treatmentValues);
  const meanControl = mean(controlValues);
  if (meanControl === 0) {
    throw new Error(`relativeReduction: mean(control) is 0 (mean(treatment)=${meanTreatment}) — the reduction ratio is undefined`);
  }
  return 1 - meanTreatment / meanControl;
}

// Contract:
// pre: samples.treatment and samples.control are arrays of finite numbers;
//      replicates/confidenceLevel satisfy percentileRanks' preconditions;
//      generator is a createSeededGenerator() instance; statistic(t, c) is a
//      pure function of two number arrays.
// post: returns { estimate, lower, upper, replicates, confidence_level,
//      ranks, method: "percentile", degenerate }. Each of the B replicates
//      resamples treatment and control independently with replacement
//      (source: Efron, B. & Tibshirani, R.J. 1993, "An Introduction to the
//      Bootstrap", Chapman & Hall/CRC — bibliographic record verified via
//      Crossref DOI 10.1007/978-1-4899-4541-9 2026-09-03 — ch. 8's two-sample
//      problem: each of the two samples is resampled independently from
//      itself; primary Efron, B. 1979, "Bootstrap Methods: Another Look at
//      the Jackknife", Ann. Statist. 7(1):1-26, DOI 10.1214/aos/1176344552,
//      verified via Crossref 2026-09-03 — the chapter/page for the
//      independent-resampling statement could not be read from a primary
//      excerpt this session, cited at chapter granularity only). The
//      interval is the percentile method (Efron & Tibshirani 1993 ch. 13,
//      same verification caveat). degenerate is true when either input
//      sample has fewer than 2 observations — every resample is then
//      identical to the original sample, a fact reported rather than hidden.
export function bootstrapPercentileInterval({ samples, statistic, replicates, confidenceLevel, generator }) {
  const estimate = statistic(samples.treatment, samples.control);
  const degenerate = samples.treatment.length < 2 || samples.control.length < 2;
  const replicateStats = new Array(replicates);
  for (let i = 0; i < replicates; i++) {
    const treatmentStar = resampleWithReplacement(samples.treatment, generator);
    const controlStar = resampleWithReplacement(samples.control, generator);
    replicateStats[i] = statistic(treatmentStar, controlStar);
  }
  return finalizeBootstrapInterval({ estimate, replicateStats, replicates, confidenceLevel, degenerate });
}

// Contract:
// pre: replicateStats has exactly `replicates` entries; replicates/
//      confidenceLevel satisfy percentileRanks' preconditions.
// post: returns { estimate, lower, upper, replicates, confidence_level,
//      ranks, method: "percentile", degenerate } — the sort-and-pick step
//      shared by bootstrapPercentileInterval above and
//      frugality-aggregate.mjs's stratified pooled variant, extracted so
//      the rank-indexing logic (the actual risk of an off-by-one) exists in
//      exactly one place (coding-standards.md §3.3: DRY once a second real
//      use exists, not speculatively).
export function finalizeBootstrapInterval({ estimate, replicateStats, replicates, confidenceLevel, degenerate }) {
  const { lowerRank, upperRank } = percentileRanks({ replicates, confidenceLevel });
  const sorted = [...replicateStats].sort((a, b) => a - b);
  return {
    estimate,
    lower: sorted[lowerRank - 1],
    upper: sorted[upperRank - 1],
    replicates,
    confidence_level: confidenceLevel,
    ranks: { lower: lowerRank, upper: upperRank },
    method: "percentile",
    degenerate
  };
}
