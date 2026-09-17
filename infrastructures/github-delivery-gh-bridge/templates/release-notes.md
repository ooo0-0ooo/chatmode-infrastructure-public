# RELEASE_TAG

> GitHub Pre-release source for the frozen delivery.

- Date: YYYY-MM-DD
- Status: `Pre-release / Not Accepted / Not Final`
- Tag: `RELEASE_TAG`
- Frozen source commit: `FULL_COMMIT_SHA`
- Source branch: `SOURCE_BRANCH`
- Pull Request: `PR_URL`
- Exact Deployment ID: `DEPLOYMENT_ID`
- Exact Deployment: `DEPLOYMENT_URL`
- Acceptance entry: `ACCEPTANCE_URL`
- Handoff: `HANDOFF_URL`
- Acceptance: `ACCEPTANCE_DOC_URL`
- QA evidence: `QA_URL`
- Previous version: `PREVIOUS_TAG`
- Next version: none

## Scope

Describe only this round's requested changes. Historical frozen versions are not rewritten.

## Principal changes

- Change 1
- Change 2
- Change 3

## Verification result

Verified evidence:

- frozen commit reviewed;
- annotated tag resolves to the frozen commit;
- PR metadata reviewed;
- exact deployment/build result reviewed;
- release published from an existing verified tag.

Not claimed as PASS unless actually verified:

- deployed click-flow matrix;
- strict pixel comparison;
- deployed console/network/accessibility sweep;
- independent lint/calculation results.

## Preservation note

- Do not retarget or modify prior frozen tags / Releases.
- Post-freeze governance metadata may continue after the immutable tag target.
- User acceptance status must not be inferred from publication alone.
