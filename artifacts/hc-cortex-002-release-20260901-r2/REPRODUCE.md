# Reproduce HC-CORTEX-002 analysis

From the registered harness-comparison revision, run:

```sh
node scripts/analyze-hc-cortex-002.mjs <release-root>
node scripts/seal-hc-cortex-002.mjs --status PILOT <release-root>
node scripts/validate-benchmark-release.mjs <release-root>
```

The analyzer refuses overwrite, so reproduction starts from a byte-identical raw release copy whose input-set digest is `8e1a35799deb9e2bef382e935295cdb2ebdaa0f7c81ed9110bdc1cb437c1f762`.
