# Portable Lark / Feishu bridge configuration

This directory is the public migration/configuration layer for adapting a private Lark/Feishu bridge implementation to a new environment.

Parameterize at least:

- private runtime repository;
- runtime and asset branches or backend endpoints;
- ops/auth mailbox paths;
- local install directory;
- `gh` path;
- Lark CLI path;
- polling interval and payload limits;
- startup/autostart behavior.

Preserve the implementation's security controls when adapting it: command allowlists, blocked administrative operations, explicit write intent, current-message write authorization, mutation replay protection, isolated binary temp storage, and verified OAuth scope checks.

The real runtime repository/backend must remain private. This public directory should contain examples only, never live mailbox state.
