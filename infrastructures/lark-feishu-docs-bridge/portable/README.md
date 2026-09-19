# Portable Lark / Feishu bridge configuration

**English | [中文](README.zh-CN.md)**

This directory is the public configuration layer for adapting the sanitized runtime under `../runtime/` to a private deployment.

Parameterize at least:

- private runtime repository;
- runtime and asset branches or backend endpoints;
- source repository/branch used by the installer;
- ops/auth mailbox paths;
- local install directory;
- `gh` path;
- Lark CLI path;
- polling interval and payload limits;
- OAuth keepalive interval and protection window;
- startup/autostart behavior.

Preserve the runtime's security controls when adapting it:

- command allowlists;
- blocked administrative operations;
- explicit write intent;
- current-message write authorization;
- mutation replay protection;
- isolated binary temp storage;
- verified current-user OAuth scopes;
- host-local OAuth device credential;
- no raw device-code handoff through Chat/Git.

The runtime **source** can be public and is included in this package. The actual runtime repo/backend that carries live mailbox state and private Lark data must remain private.

Never commit:

- access tokens;
- refresh tokens;
- device codes;
- host-local pending OAuth sessions;
- real app secrets;
- live private mailbox traffic;
- private binary asset chunks.
