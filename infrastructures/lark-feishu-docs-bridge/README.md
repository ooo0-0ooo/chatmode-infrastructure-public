# Lark / Feishu document bridge — public source

This directory describes the portable/public boundary of a Chat-mode bridge for controlled Lark/Feishu document operations.

The private implementation may use a GitHub mailbox plus a local watcher to invoke authenticated Lark tooling. The public snapshot deliberately excludes verified production watchers, real runtime branches, request/response state, OAuth state, binary assets, and project-specific provenance.

## Publicly shareable material

- generalized architecture and migration guidance;
- parameterized environment-variable examples;
- security gates and permission model;
- portable installation/migration notes.

## Intentionally private

- production `verified/` runtime code if it still contains environment-bound defaults;
- real `ops-request`, `ops-response`, `auth-request`, or `auth-response` state;
- binary asset chunks and reconstructed files;
- OAuth/session material;
- real document IDs, user data, screenshots, logs, and QA evidence.

## Runtime separation

Deploy the actual bridge against a private runtime repository/backend. Do not point a production bridge at this public source repository as its live mailbox.

See `portable/` for the generalized configuration layer.
