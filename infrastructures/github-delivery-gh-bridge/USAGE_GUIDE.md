# GitHub Delivery Bridge — Chat Mode Usage Guide

> **Rights notice:** this repository has no open-source license. This guide explains how an authorized user can operate the infrastructure. It does not grant permission to reuse, modify, redistribute, or commercialize the source.

## What this package is

This package provides reusable Git + GitHub CLI (`gh`) helpers for the last stage of a software delivery workflow:

```text
working branch
  -> frozen commit
  -> annotated tag
  -> Pull Request metadata
  -> Pre-release / Release
  -> read-back verification
```

The public package includes:

```text
scripts/
  verify-gh.ps1
  release-preflight.ps1
  publish-prerelease.ps1

templates/
  release-notes.md
```

The scripts are directly usable on a machine with Git, PowerShell, and GitHub CLI.

However, there is one important Chat-mode boundary:

**The public package does not itself give ordinary ChatGPT Chat arbitrary access to your local shell.**

If Chat only has the GitHub connector, it can inspect and modify GitHub resources exposed by that connector, but it cannot automatically execute your local `git` / `gh` commands unless you also provide a controlled execution channel such as an authorized local runner or a typed Remote MCP/tool that invokes these scripts.

So there are two valid operating modes:

1. **Manual local execution:** Chat plans and verifies the delivery; you run the provided commands/scripts locally.
2. **Integrated Chat execution:** expose only these bounded delivery operations through a controlled runner/tool so Chat can invoke them directly after explicit authorization.

The second mode is the closest to the intended “ordinary Chat can finish GitHub delivery end to end” experience.

---

## 1. Prerequisites

You need:

- a local clone of the target GitHub repository;
- Git installed;
- GitHub CLI `gh` installed;
- Windows PowerShell for the included `.ps1` helpers;
- a GitHub account with the required permissions on the target repository;
- HTTPS Git authentication configured through `gh` or another secure credential mechanism;
- ChatGPT connected to the target GitHub repository if you want Chat to inspect PRs, commits, releases, and repository state.

For a fully automated Chat-mode workflow, you additionally need a **controlled execution bridge** that can run the approved Git/`gh` operations on your machine or trusted backend.

---

## 2. Install GitHub CLI

On Windows:

```powershell
winget install --id GitHub.cli --source winget
```

Close the old terminal, open a new one, then verify:

```powershell
gh --version
```

Authenticate:

```powershell
gh auth login
```

A common setup is:

```text
GitHub.com
HTTPS
Authenticate Git with your GitHub credentials? Yes
Login with a web browser
```

Then verify:

```powershell
gh auth status
```

Do not store GitHub tokens, browser device codes, credential-helper plaintext, or personal credentials in this repository.

---

## 3. Verify access to the target repository

From PowerShell:

```powershell
gh repo view OWNER/REPO
```

Then run the included read-only helper:

```powershell
.\scriptserify-gh.ps1 -Repo OWNER/REPO
```

The helper checks:

```text
gh installed
+ GitHub authentication valid
+ target repository accessible
```

If this step fails, fix authentication or repository permissions before attempting any release operation.

---

## 4. Put the helper scripts where you will run them

You have two reasonable options.

### Option A — copy the helpers into the target project

For example:

```text
TARGET_REPO/
  delivery-tools/
    verify-gh.ps1
    release-preflight.ps1
    publish-prerelease.ps1
    release-notes.md
```

This makes the release procedure versioned with the project.

### Option B — keep this toolkit separately

Run the scripts from the toolkit while your terminal's current working directory is the target project's local Git clone.

The scripts assume Git commands are operating against the repository you intend to freeze and publish. Always verify the working directory before mutation.

---

## 5. Decide the delivery boundary before doing anything destructive

A delivery should be centered on one exact immutable commit.

The intended model is:

```text
mutable development branch
  -> exact frozen commit SHA
  -> annotated tag points to that commit
  -> GitHub Release references the existing tag
  -> later governance/documentation commits may continue without changing the frozen source
```

Do not use an ambiguous moving `HEAD` as the only release record.

Record the full commit SHA you intend to freeze.

Example:

```powershell
git show --no-patch --oneline <FULL_COMMIT_SHA>
```

---

## 6. Run the read-only preflight first

Before creating a tag or release, run:

```powershell
.\scriptselease-preflight.ps1 `
  -Repo OWNER/REPO `
  -Tag YOUR_TAG `
  -Commit FULL_COMMIT_SHA
```

This helper is intentionally non-mutating. It checks:

- GitHub authentication;
- target repository access;
- local working-tree state;
- latest refs/tags fetch;
- that the frozen commit can be resolved;
- whether the tag already exists locally;
- whether the tag already exists remotely.

Also inspect the local repository yourself:

```powershell
git status --short --branch
git fetch --all --tags
```

Do not proceed if you are in the wrong repository, the wrong account is authenticated, or the frozen commit is not the commit you intend to ship.

---

## 7. Create the annotated tag

The public package intentionally leaves annotated-tag creation to native Git because Git is the authoritative tool for local commit/ref objects.

Confirm the tag does not already exist:

```powershell
git tag --list YOUR_TAG
git ls-remote --tags origin "refs/tags/YOUR_TAG*"
```

Then create the annotated tag against the **explicit frozen SHA**:

```powershell
git tag -a YOUR_TAG FULL_COMMIT_SHA -m "YOUR_TAG"
```

Verify the peeled commit:

```powershell
git rev-parse "YOUR_TAG^{}"
git show --no-patch --decorate YOUR_TAG
```

The `rev-parse` output must equal the intended frozen commit SHA.

Push only the intended tag:

```powershell
git push origin refs/tags/YOUR_TAG
```

Verify the remote:

```powershell
git ls-remote --tags origin "refs/tags/YOUR_TAG*"
```

An annotated tag normally produces a tag-object line and a peeled `^{}` commit line. The peeled commit must still match your frozen SHA.

Never move an old frozen tag merely to make a new build look accepted.

---

## 8. Create or update the Pull Request

If a delivery PR does not yet exist:

```powershell
gh pr create `
  --repo OWNER/REPO `
  --base BASE_BRANCH `
  --head HEAD_BRANCH `
  --title "PR title" `
  --body-file PR_BODY.md
```

If the PR already exists:

```powershell
gh pr edit PR_NUMBER `
  --repo OWNER/REPO `
  --title "Updated title" `
  --body-file PR_BODY.md
```

Read it back:

```powershell
gh pr view PR_NUMBER --repo OWNER/REPO
```

Whether the PR should be merged is a separate project-governance decision. Do not make “merge” an automatic consequence of creating a release record.

---

## 9. Prepare the Release notes

Copy:

```text
templates/release-notes.md
```

to a project-specific file, for example:

```text
RELEASE_NOTES.md
```

Replace all placeholders with real values.

Useful fields include:

- date;
- release state (`Pre-release`, `Not Accepted`, `Final`, etc.);
- tag;
- frozen commit SHA;
- source branch;
- Pull Request;
- exact deployment/build reference when relevant;
- acceptance/handoff/QA evidence;
- previous version;
- scope of this round;
- verification actually performed.

Do not claim gates passed unless you have real evidence.

A GitHub Release body is governance metadata. It must not be used to quietly redefine which commit the tag points to.

---

## 10. Preview the Pre-release mutation

The provided `publish-prerelease.ps1` uses PowerShell `SupportsShouldProcess`, so you can inspect the intended operation with `-WhatIf` first:

```powershell
.\scripts\publish-prerelease.ps1 `
  -Repo OWNER/REPO `
  -Tag YOUR_TAG `
  -NotesFile .\RELEASE_NOTES.md `
  -Title "YOUR_TAG" `
  -WhatIf
```

This is the recommended step before an actual publish operation.

The script also checks that:

- the release notes file exists;
- GitHub authentication is valid;
- the target repository is accessible;
- the remote tag already exists;
- a Release for that tag does not already exist.

It intentionally refuses to silently overwrite an existing Release.

---

## 11. Publish the Pre-release

After the preflight and `-WhatIf` output are correct, run:

```powershell
.\scripts\publish-prerelease.ps1 `
  -Repo OWNER/REPO `
  -Tag YOUR_TAG `
  -NotesFile .\RELEASE_NOTES.md `
  -Title "YOUR_TAG"
```

Internally, the helper uses the equivalent of:

```text
gh release create <TAG>
  --repo <OWNER/REPO>
  --verify-tag
  --prerelease
  --title <TITLE>
  --notes-file <FILE>
```

`--verify-tag` matters because the release process should consume an already-existing, already-verified tag rather than implicitly creating a new tag at an unintended commit.

The helper then performs a read-back with `gh release view`.

---

## 12. Verify the release after publication

Always read the result back:

```powershell
gh release view YOUR_TAG --repo OWNER/REPO
```

Verify at least:

```text
tag
release title
pre-release/final state
notes
published time
assets, if any
```

Also re-verify the tag itself:

```powershell
git ls-remote --tags origin "refs/tags/YOUR_TAG*"
```

If only the Release notes need correction, edit the Release metadata without moving the tag:

```powershell
gh release edit YOUR_TAG `
  --repo OWNER/REPO `
  --notes-file .\RELEASE_NOTES.md
```

---

## 13. How to use this with ordinary ChatGPT Chat — manual execution mode

This mode works even when Chat has GitHub access but no local command-execution tool.

Connect ChatGPT to the target GitHub repository.

Then start the delivery conversation with a request such as:

```text
Use the connected GitHub repository OWNER/REPO to restore the current delivery state. Identify the intended frozen commit, existing PR, existing tags/releases, and any delivery evidence. Do not move or delete existing frozen tags/releases. Prepare the exact local Git/gh commands needed to create a new annotated tag and GitHub Pre-release for the frozen commit, using the repository's delivery process. Separate read-only preflight from mutation and stop before any destructive operation that I have not explicitly requested.
```

Chat can then:

- inspect repository state available through GitHub;
- help determine the exact frozen commit;
- draft PR/Release notes;
- give you the precise helper-script invocation;
- inspect GitHub state again after you execute the local mutation.

You run the local scripts/commands yourself and tell Chat when the step is complete, or let Chat re-read GitHub state to verify it.

This mode is safe and practical, but it is not fully hands-free.

---

## 14. How to make Chat execute the delivery directly

To remove the manual terminal step, expose a **controlled execution bridge** to Chat.

Do not expose unrestricted arbitrary shell execution merely to run these scripts.

A better design is a small typed tool surface such as:

```text
delivery.verify_environment
delivery.preflight
delivery.create_annotated_tag
delivery.push_tag
delivery.create_or_update_pr
delivery.publish_prerelease
delivery.edit_release_notes
delivery.verify_delivery
```

Each tool should accept explicit structured arguments such as:

```text
repo
working_directory
commit_sha
tag
base_branch
head_branch
pr_number
notes_file
release_title
```

The runner can internally call native Git and `gh`, but Chat should not be able to send an arbitrary shell string.

### Required write authorization rule

Read-only actions can run without mutation authorization.

Any action that creates/edits/pushes/publishes/deletes/merges must require an explicit current-message authorization from the user.

Do not treat “GitHub is logged in” as standing permission to mutate repositories.

### Recommended execution order

A typed runner should enforce:

```text
verify_environment
  -> preflight
  -> explicit user authorization
  -> create annotated tag
  -> verify local peeled tag
  -> push tag
  -> verify remote peeled tag
  -> create/update PR as requested
  -> publish Pre-release with --verify-tag
  -> read-back verification
```

If any verification fails, stop instead of continuing optimistically.

---

## 15. Suggested Chat prompt for an integrated runner

Once Chat has both GitHub access and your controlled delivery runner, a fresh Chat can start with:

```text
For repository OWNER/REPO, use the connected GitHub data plus the approved delivery tools to complete the requested project freeze. Start with read-only preflight. Use the exact frozen commit SHA; never use an ambiguous moving HEAD as the final release target. Never retarget, delete, or overwrite an existing frozen tag or Release. Any mutation must match an explicit request in my current message. After each mutation, read the state back and verify tag -> commit, PR, Release status, and notes before reporting completion.

<DESCRIBE THE DELIVERY TASK HERE>
```

This captures the important safety/governance behavior without requiring the user to remember the individual Git commands every time.

---

## 16. What the public scripts do and do not do

### `verify-gh.ps1`

Read-only.

It verifies:

```text
GitHub CLI installed
GitHub authentication valid
target repository accessible
```

### `release-preflight.ps1`

Read-only.

It verifies:

```text
GitHub authentication
repository access
working-tree state
remote refs/tags fetched
frozen commit exists
tag conflicts locally/remotely
```

### `publish-prerelease.ps1`

Mutating.

It:

```text
checks notes file
checks auth/repo
requires remote tag to exist
refuses existing Release overwrite
publishes Pre-release with --verify-tag
reads the Release back
```

It does **not** create the annotated tag for you.

It does **not** decide whether the release should be Final rather than Pre-release.

It does **not** merge PRs.

It does **not** manage deployments on Vercel/v0/other platforms.

---

## 17. Security and governance rules

Keep these rules even if you build a more automated runner:

- no force push by default;
- never move/delete an existing frozen tag without a separately explicit destructive request;
- never silently retarget a historical Release;
- no automatic PR merge merely because a Release was published;
- use exact repository names and full commit SHAs for freeze operations;
- use `--verify-tag` when publishing from a tag;
- perform read-back verification after mutation;
- keep GitHub credentials in `gh` / OS credential storage, not repository files;
- do not commit personal email addresses, access tokens, device codes, or local absolute paths into reusable templates;
- treat branch protection, organization rulesets, SSO, and required reviews as authoritative project governance.

If a repository's organization policy blocks an operation, do not weaken the policy just to make the automation pass.

---

## 18. Troubleshooting

### `gh auth status` fails

Run:

```powershell
gh auth login
```

and verify you authenticated the correct GitHub account/host.

### `gh repo view OWNER/REPO` fails

Check:

- repository name;
- account permissions;
- organization SSO authorization;
- private-repository access;
- whether you are authenticated to the correct GitHub host.

### Preflight says the tag already exists

Stop and inspect the existing tag. Do not reuse or move it simply because you wanted the same name.

Choose the correct project-governance action: use the existing frozen version if it is correct, or create a new version/tag.

### `publish-prerelease.ps1` says the remote tag does not exist

Create, verify, and push the annotated tag first. The script intentionally refuses to let `gh release create` invent the release tag for you.

### Release already exists

Inspect it:

```powershell
gh release view YOUR_TAG --repo OWNER/REPO
```

If only metadata needs correction and the user explicitly requests it, use `gh release edit`. Do not create a duplicate or retarget the tag.

### Chat can inspect GitHub but cannot run the scripts

That is expected if Chat only has the GitHub connector. Use manual execution mode or provide a controlled local/remote execution tool as described above.

### Local tag looks correct but remote verification differs

Stop. Verify the exact object/peeled commit before doing any Release work. A Release should not be published until the remote tag is proven to resolve to the intended frozen commit.

---

## 19. When this infrastructure is fully set up

### Manual mode is ready when

```text
Git + gh installed
+ target repo authenticated
+ helper scripts run locally
+ Chat can inspect target GitHub repo
+ frozen commit/tag/release procedure is documented
+ release read-back verification works
```

### Integrated Chat mode is ready when

```text
all manual-mode requirements
+ Chat has a bounded execution tool for approved Git/gh operations
+ the tool does not expose arbitrary shell by default
+ mutations require current-message authorization
+ a real preflight -> tag -> push -> release -> read-back cycle succeeds
```

At that point Chat can participate in the full GitHub delivery loop without requiring the user to manually open the GitHub website for the final Tag/Release steps.
