# Portable · Chat-mode Playwright Browser QA

A reusable GitHub Actions + Playwright kit for giving ordinary Chat workflows a deterministic browser QA loop.

## Included structure

```text
.github/workflows/
  chatmode-browser-qa.yml
qa/chatmode-browser-qa/
  run-visual-qa.mjs
  visual-references.example.json
  project-adapter.example.mjs
.chatmode/
  development-branch-policy.example.json
scripts/
  create-development-branch.mjs
  verify-development-branch-policy.mjs
  advance-development-base.mjs
snippets/
  AGENTS.browser-qa.snippet.md
  package-scripts.example.json
```

## Integration outline

1. Copy these files into the target project without replacing unrelated project QA.
2. Copy `visual-references.example.json` to `visual-references.json` and define the cases to exercise.
3. Copy `project-adapter.example.mjs` to `project-adapter.mjs` and implement target-project state setup.
4. Configure `.chatmode/development-branch-policy.json` from the example.
5. Merge the package-script snippet rather than replacing the existing `package.json`.
6. Add the workflow and set `CHATMODE_QA_BASELINE_REF` to an immutable accepted reference.
7. Run at least one real fail → evidence → fix → pass cycle before treating the integration as verified.

## Runtime evidence

The runner can collect console errors, page exceptions, HTTP failures, failed requests, deterministic screenshots, browser-baseline comparisons, and optional reference-image comparisons.

## Security

Keep real credentials and private test-account state outside the repository. Prefer mocks, fixtures, sandboxes, or dedicated low-privilege test accounts. CI workflows should use least privilege and should not grant untrusted fork PRs mutation access to private state.
