# Lark / Feishu document bridge — public source

**English | [中文](README.zh-CN.md)**

This directory publishes the sanitized, portable form of a Chat-mode bridge for controlled Lark/Feishu document operations.

The package now includes the repaired watcher/supervisor runtime source in `runtime/`, plus deployment guidance, parameterized configuration, security boundaries, and a sanitized incident/repair history.

It deliberately excludes live private state: real mailbox traffic, OAuth credentials, binary assets, document IDs, user/app identifiers, private logs, screenshots, and project-specific provenance.

## What changed in the September 2026 repair

A previously validated bridge failed after a long idle period because:

- token refresh only happened lazily during real user API calls, so a rotating refresh token could expire while the bridge sat idle;
- the old OAuth recovery contract forwarded a temporary `device_code` through GitHub/Chat, which conflicts with credential-safety boundaries and should not have entered Git history anyway;
- updating source files did not automatically replace an already-running local watcher process.

The repaired runtime now uses:

- host-local `device_code`;
- opaque `auth_session_id`;
- `auth.finish_pending(auth_session_id)`;
- `auth.health`;
- `auth.keepalive`;
- periodic token lifecycle checks;
- a configurable refresh-protection window;
- installer-driven supervisor restart after runtime activation.

See:

- [runtime/](runtime/)
- [repair history](history/2026-09-oauth-lifecycle-repair.md)
- [English usage guide](USAGE_GUIDE.md)
- [中文使用指南](USAGE_GUIDE.zh-CN.md)

## Publicly included

- sanitized runtime source;
- generalized architecture and migration guidance;
- parameterized environment-variable examples;
- security gates and permission model;
- OAuth lifecycle/recovery design;
- troubleshooting and validation guidance;
- sanitized failure/root-cause history.

## Intentionally private

- live `ops-request`, `ops-response`, `auth-request`, or `auth-response` traffic;
- access tokens, refresh tokens, device codes, local pending OAuth sessions, app secrets;
- binary asset chunks and reconstructed private files;
- real document IDs, user IDs, app IDs, screenshots, logs, and private QA evidence;
- environment-bound production provenance.

## Runtime separation

Use the public `runtime/` source as code, but deploy the actual bridge against a **private** runtime repository/backend. Do not point a production bridge at this public repository as its live mailbox.

Configuration examples are under `portable/`.
