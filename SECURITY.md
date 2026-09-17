# Security and publication boundary

This public-source snapshot must remain separate from private runtime state.

## Never commit to the public source repository

- API keys, access tokens, refresh tokens, OAuth device codes, cookies, session data, or credentials;
- production mailbox request/response files;
- binary asset chunks or reconstructed private artifacts;
- screenshots, traces, logs, or test fixtures containing personal or business data;
- private repository URLs, private document URLs, internal IDs, or project-specific secrets;
- real local machine paths when they reveal private environment details;
- verified production baselines copied verbatim from a private environment unless separately reviewed.

## Recommended deployment model

Use two repositories or equivalent trust zones:

1. **Public source repository** — portable code, examples, documentation, templates.
2. **Private runtime repository/backend** — actual mailboxes, runtime branches, artifacts, secrets, OAuth state, and execution evidence.

The public source repository should never be used as the live request/response transport for private user data.

## GitHub Actions

Default workflows should use least privilege, normally `contents: read`. Grant write permissions only to narrowly scoped jobs that cannot be triggered into mutating protected/private state by untrusted fork pull requests.

## Before every public release

Review both the current tree and Git history. Removing a sensitive file from the latest commit does not remove it from older commits. If a secret has ever been committed, rotate it and rewrite/remove the affected history before publication.
