# Chat-mode Playwright Browser QA — Usage Guide

> **Rights notice:** this repository has no open-source license. This guide explains how an authorized user can integrate and operate the infrastructure. It does not grant permission to reuse, modify, redistribute, or commercialize the source.

## What this package is

This package is a **portable browser-QA integration kit for an existing Web application**.

It is not a standalone app. You copy the files under `portable/` into the Web project you want ChatGPT to modify and verify.

After integration, the intended loop is:

```text
User asks ChatGPT to change the product
        |
        v
Chat restores GitHub branch / PR / Actions state
        |
        v
Chat changes code on the active development branch
        |
        v
Draft PR triggers GitHub Actions
        |
        v
Playwright builds + serves + exercises deterministic states
        |
        +--> runtime errors
        +--> screenshots
        +--> browser-regression comparison
        +--> optional design/reference exact comparison
        |
        v
Workflow artifact
        |
        v
Chat reads the evidence and continues fixing the same branch
```

This public package is the most directly reusable of the three kits in this repository: the core workflow, runner, branch-policy scripts, examples, and Chat/agent snippet are already included.

---

## 1. Prerequisites

You need an existing Web application repository that can be built and served in CI.

The provided workflow assumes:

- GitHub repository;
- GitHub Actions enabled;
- ChatGPT connected to the target GitHub repository;
- Node.js 22 in CI;
- pnpm as the reference package manager;
- a `build` script;
- a production `start` script that honors `PORT`;
- at least one immutable accepted tag/commit/ref that can be used as the browser regression baseline;
- deterministic ways to put the application into the UI states you want to test.

The runner uses:

- Playwright Chromium;
- `pixelmatch`;
- `pngjs`.

If your project uses npm, yarn, Bun, another Node version, or another server contract, edit the workflow accordingly and re-run the full black-box validation cycle.

---

## 2. Copy the portable kit into the target project

From this repository:

```text
infrastructures/chatmode-playwright-browser-qa/portable/
```

copy the contents into the **root of the target Web project** so the resulting project contains:

```text
.github/workflows/chatmode-browser-qa.yml
.chatmode/development-branch-policy.example.json
qa/chatmode-browser-qa/
  run-visual-qa.mjs
  visual-references.example.json
  project-adapter.example.mjs
scripts/
  create-development-branch.mjs
  verify-development-branch-policy.mjs
  advance-development-base.mjs
snippets/
  AGENTS.browser-qa.snippet.md
  package-scripts.example.json
```

Do not delete or replace unrelated existing test infrastructure. Install this kit side-by-side first.

---

## 3. Create the real project configuration files

The public package deliberately ships examples rather than pretending it already knows your application.

Create these real project files:

```text
.chatmode/development-branch-policy.json
qa/chatmode-browser-qa/visual-references.json
qa/chatmode-browser-qa/project-adapter.mjs
```

Start by copying the corresponding `.example` files.

---

## 4. Configure the development branch policy

Copy:

```text
.chatmode/development-branch-policy.example.json
```

to:

```text
.chatmode/development-branch-policy.json
```

Then customize it for your repository.

The important fields are:

### `rollingDevelopmentBase`

A branch that represents the latest formally accepted product state plus the permanent QA infrastructure.

Example:

```json
{
  "rollingDevelopmentBase": "infra/chatmode-browser-qa"
}
```

New development rounds should start from this branch, not from a stale acceptance branch and not automatically from `main`.

### `initialProductBaseline`

The immutable accepted ref from which the first rolling base was established.

Example:

```json
{
  "initialProductBaseline": "acceptance-r1"
}
```

Use your own real tag/ref.

### `frozenAcceptanceBranchPattern`

This protects accepted/frozen branches from being reused as active development branches.

The example uses:

```json
{
  "frozenAcceptanceBranchPattern": "^acceptance-r\\d+(?:-[a-z0-9-]+)?$"
}
```

Change it if your project uses another naming convention.

### `requiredInheritedPaths`

These are the files every candidate branch must inherit. Keep the QA workflow, runner, adapter, manifest, and branch-policy scripts in this list.

The policy scripts then enforce that a new candidate really descends from the rolling development base and still contains the required infrastructure.

---

## 5. Merge the required package scripts

Do not replace your `package.json`.

Merge the relevant entries from:

```text
snippets/package-scripts.example.json
```

The minimum infrastructure scripts are:

```json
{
  "scripts": {
    "branch:new": "node scripts/create-development-branch.mjs",
    "branch:verify": "node scripts/verify-development-branch-policy.mjs",
    "branch:advance-base": "node scripts/advance-development-base.mjs",
    "qa:browser": "node qa/chatmode-browser-qa/run-visual-qa.mjs"
  }
}
```

Your application must also expose production build/start commands compatible with the workflow, for example:

```json
{
  "scripts": {
    "build": "<your production build command>",
    "start": "<your production server command; must honor PORT>"
  }
}
```

If your project already has `typecheck`, `lint`, `verify:calculations`, unit tests, or other gates, keep them. The workflow is designed to run static/project gates before browser verification where appropriate.

---

## 6. Install or verify browser-QA dependencies

The workflow installs a pinned browser-QA runtime itself, but for local execution you can install the same dependencies in the target project:

```bash
pnpm add -D playwright@1.55.0 pixelmatch@7.1.0 pngjs@7.0.0
pnpm exec playwright install chromium
```

In Linux CI, the workflow uses:

```bash
pnpm exec playwright install --with-deps chromium
```

If you intentionally change these versions, treat it as a renderer/runtime change and re-establish the relevant baselines.

---

## 7. Implement `project-adapter.mjs`

Copy:

```text
qa/chatmode-browser-qa/project-adapter.example.mjs
```

to:

```text
qa/chatmode-browser-qa/project-adapter.mjs
```

This is the most important project-specific file.

Its job is to place the application into a deterministic state **before the screenshot is taken**.

Typical responsibilities include:

- selecting language/locale;
- entering a known test login state;
- setting deterministic fixture data;
- opening a specific dialog or drawer;
- navigating to a particular route;
- selecting a role/account type;
- waiting for known asynchronous product state to settle.

The example uses placeholder localStorage keys such as `qa.example.locale`. Replace those with your actual test/demo mechanism.

Good adapter mechanisms include:

- project-owned test/demo routes;
- fixture APIs;
- mock data modes;
- deterministic browser storage understood by the app;
- dedicated low-privilege test accounts;
- stable UI interactions using roles, labels, or `data-*` selectors.

Do **not** use the adapter to mutate DOM/CSS merely to make a screenshot match the reference. The adapter prepares real application state; it should not fake the expected result.

The adapter must export:

```js
export async function prepareCase({ page, context, origin, caseDefinition, manifest }) {
  // enter deterministic application state
}
```

It may also export:

```js
export async function beforeCapture({ page, context, origin, caseDefinition, manifest }) {
  // optional final stabilization step
}
```

---

## 8. Define the QA cases in `visual-references.json`

Copy:

```text
qa/chatmode-browser-qa/visual-references.example.json
```

to:

```text
qa/chatmode-browser-qa/visual-references.json
```

A manifest contains global rendering settings plus one or more cases.

Example shape:

```json
{
  "fixtureTime": "2026-01-15T12:00:00.000Z",
  "viewport": {
    "width": 1440,
    "height": 1000,
    "deviceScaleFactor": 1,
    "colorScheme": "light"
  },
  "ignoreRuntimeUrlPatterns": [
    "/favicon.ico",
    "/_vercel/"
  ],
  "cases": [
    {
      "id": "home-en",
      "path": "/home",
      "state": {
        "locale": "en",
        "auth": "test-user"
      },
      "capture": {
        "mode": "selector",
        "selector": "[data-qa-shell]",
        "padding": 0
      },
      "reference": "qa/references/home-en.png"
    }
  ]
}
```

### `fixtureTime`

Freezes `Date.now()` / default `new Date()` behavior inside the browser context. Use this when dates, ages, countdowns, or time-dependent copy would otherwise change screenshots between runs.

### `viewport`

Set the exact viewport and device scale used for deterministic rendering.

### `state`

Arbitrary project-specific input consumed by your adapter.

### `capture`

Supported modes include:

```text
page      -> whole page / full-page screenshot
selector  -> first matching selector
clip      -> explicit x/y/width/height region
```

### `reference`

Optional exact design/reference PNG. If provided, the runner produces exact pixel-difference evidence against that file.

Use separate cases when the visual state materially differs, for example:

- desktop vs mobile;
- English vs Chinese;
- logged-in vs logged-out;
- different account roles;
- dialog open vs closed;
- success/error/empty/loading states.

---

## 9. Add design/reference images when needed

If you need exact visual evidence against a design export, place reviewed PNG files in a stable project path such as:

```text
qa/references/
```

Then point each manifest case to the intended file.

The runner distinguishes two concepts:

### Browser regression baseline

Candidate Chromium output is compared against the Chromium output generated from an immutable accepted source ref.

This is the blocking regression gate when configured.

### Design / Figma exact audit

Candidate output can also be compared exactly against a reference PNG.

This is kept as explicit evidence because cross-renderer differences can exist. Do not hide those differences by adding an arbitrary large tolerance and then calling the result exact.

---

## 10. Configure the immutable browser baseline

In the **target project's GitHub repository**, create a repository variable:

```text
CHATMODE_QA_BASELINE_REF=<IMMUTABLE_ACCEPTED_TAG_OR_COMMIT>
```

Examples:

```text
acceptance-r17
v1.4.0-accepted
4f43d8c0...
```

Use an immutable accepted ref.

Do not use mutable `main` merely because it is convenient; otherwise today's candidate can silently redefine tomorrow's baseline.

The workflow also accepts a manual `baseline_ref` input when launched through `workflow_dispatch`.

---

## 11. Verify the workflow against your application

The provided workflow does roughly this:

```text
resolve baseline ref
  -> checkout candidate
  -> checkout immutable baseline into a second directory
  -> install dependencies
  -> verify branch policy
  -> run typecheck/lint/calculation gates when available
  -> build candidate
  -> build baseline
  -> start baseline server on port 3001
  -> capture baseline screenshots in Chromium
  -> start candidate server on port 3000
  -> run candidate browser QA
  -> compare screenshots
  -> collect runtime failures
  -> upload summary/screenshots/diffs as artifact
```

Before relying on it, verify that your application:

- can install with the configured package manager;
- can build in GitHub-hosted Ubuntu;
- can start without interactive input;
- honors the supplied `PORT` environment variable;
- becomes HTTP-ready within the workflow's startup wait window;
- does not require unstored personal browser state.

---

## 12. Create the first Draft PR

Use a real development branch and open a Draft PR.

The workflow triggers on `pull_request`, which is the recommended normal operating mode because it gives Chat a stable evidence chain:

```text
PR
  -> head commit
  -> Actions workflow run
  -> jobs / steps / logs
  -> artifact
  -> summary.json / screenshots / diff files
```

The first run may fail. That is useful: fix the integration until the workflow itself is trustworthy.

---

## 13. Perform a deliberate fail → fix → pass validation

Do not declare the infrastructure installed just because one run happens to be green.

Run this validation sequence:

1. establish one or two deterministic cases;
2. get a clean PASS;
3. intentionally introduce a safe, obvious UI difference in the candidate branch;
4. confirm the browser regression gate fails;
5. confirm the artifact contains the expected screenshot/diff/summary evidence;
6. revert/fix the difference;
7. confirm the same case passes again.

This proves the QA loop is detecting real browser regressions rather than merely executing without errors.

---

## 14. Connect the workflow to ChatGPT Chat mode

Authorize ChatGPT's GitHub connection for the **target application repository**.

Chat should be able to inspect:

- branches;
- commits;
- Pull Requests;
- workflow runs;
- job/step results;
- logs;
- artifacts.

Add the policy from:

```text
snippets/AGENTS.browser-qa.snippet.md
```

to the target project's agent/AI instructions if your project uses an `AGENTS.md`-style rule file or equivalent repository instruction surface.

The goal is that the user does not need to say “run Playwright” on every frontend task.

A useful first message in a fresh Chat is:

```text
Use the connected GitHub repository OWNER/REPO. Before changing frontend code, restore the current development round, rolling development base, active PR, latest relevant Actions run, and immutable browser baseline. Continue an existing unfrozen round when appropriate; otherwise create the new round from the configured rolling development base. After each meaningful frontend change, use the repository's Chat-mode browser QA workflow and read the resulting runtime/visual evidence before deciding the change is complete.

<YOUR PRODUCT TASK>
```

Once the repository-level instructions are reliably loaded in your environment, you can shorten the user message to the actual product request.

---

## 15. Normal Chat-mode development loop

After setup, a typical round should look like this:

```text
User: change the UI
  -> Chat restores repo/round state
  -> Chat continues or creates a development branch
  -> Chat modifies code
  -> Chat updates/creates Draft PR
  -> Actions runs automatically
  -> Chat reads runtime + visual evidence
  -> Chat fixes failures on the same branch
  -> repeat until required gates pass
  -> project formally freezes an acceptance ref
  -> rolling development base is fast-forwarded to that frozen final commit
```

The user should not need to manually download screenshots or copy logs into Chat when the connected GitHub tooling can expose the workflow evidence directly.

---

## 16. Using `workflow_dispatch` against a deployed Demo

The workflow supports manual inputs:

```text
target_url    -> optional already-deployed URL
baseline_ref  -> optional immutable baseline override
```

If `target_url` is blank, the workflow builds and serves the candidate commit locally in CI.

If `target_url` is supplied, that URL must be accessible from the GitHub Actions runner.

For a deployment protected by login, Vercel Deployment Protection, VPN, or another gate, provide a legitimate project-owned test-access mechanism. Do not upload a personal browser profile or personal cookies into the repository to bypass protection.

---

## 17. Runtime gates the runner already collects

The runner records:

- browser `console.error` messages;
- uncaught page exceptions;
- HTTP responses with status `>= 400`;
- failed network requests.

You may configure `ignoreRuntimeUrlPatterns` only for known non-product noise that you can justify, such as a harmless favicon request.

Do not add real product failures to the ignore list merely to make the workflow green.

---

## 18. Security model

Recommended defaults:

- workflow permission: `contents: read`;
- no personal browser cookies committed to Git;
- prefer fixtures, mocks, sandboxes, or dedicated low-privilege test accounts;
- do not upload screenshots containing unnecessary private user/business data;
- do not give untrusted fork PRs write access to private state;
- keep secrets in the target repository's secret mechanism, never in the manifest or adapter source;
- review artifact retention because screenshots/traces can contain URLs, names, emails, or business data.

The portable workflow is source code, not authorization to mutate unrelated repositories or production services.

---

## 19. Troubleshooting

### Workflow fails before Playwright starts

Check package-manager assumptions, dependency install, build scripts, Node version, and branch-policy validation.

### Baseline checkout fails

Confirm `CHATMODE_QA_BASELINE_REF` exists and is readable by Actions.

### Candidate server never becomes ready

Confirm your `start` command honors `PORT`, binds to an accessible interface, and can start from the built production output in CI.

### Screenshots change every run

Eliminate nondeterminism:

- freeze time with `fixtureTime`;
- use fixture data;
- disable/randomness or provide deterministic seeds;
- wait for fonts/data to settle;
- avoid personal accounts with changing production data;
- ensure viewport/device scale are fixed.

### Adapter cannot enter a state

Create a project-owned test/demo mechanism rather than manipulating the rendered DOM after load.

### Exact design audit differs but browser regression passes

These are different evidence layers. Browser regression asks “did the accepted Chromium result change?”; design exact audit asks “does this PNG exactly equal the design/reference PNG?”. Investigate both instead of collapsing them into one verdict.

### Chat changes code but does not inspect Actions evidence

Add or strengthen repository-level agent instructions and use the explicit first-message workflow prompt shown above until the behavior is stable.

---

## 20. When the integration is complete

Treat the kit as successfully integrated only when:

```text
candidate project can build in CI
+ deterministic states can be entered
+ screenshots are stable
+ browser regression detects intentional differences
+ runtime errors are surfaced
+ artifacts are readable from Chat
+ branch policy prevents development on frozen refs
+ Chat can complete at least one real fail -> evidence -> fix -> pass loop
```

At that point this kit is functioning as intended: not a standalone Playwright demo, but a reusable browser-verification layer embedded into the target product repository.
