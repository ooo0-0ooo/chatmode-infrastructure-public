# Bridge v2 mailbox contract — public template

Deploy these mailbox files in a **private** repository.

## Ops

- `ops-request.json`
- `ops-response.json`

Every request uses a fresh `request_id`. Writes require both:

- `intent: "write"`
- `write_authorized: true`

The watcher must independently reject mutation-like commands disguised as reads.

## Auth

- `auth-request.json`
- `auth-response.json`

Supported repaired operations:

- `auth.status`
- `auth.scopes`
- `auth.start`
- `auth.start_all`
- `auth.finish_pending`
- `auth.health`
- `auth.keepalive`

`auth.start[_all]` stores the Lark `device_code` only on the host and returns an opaque `auth_session_id`. Chat sends only that session ID back in `auth.finish_pending`.

Do not implement the old `auth.finish(device_code)` mailbox contract.

## State boundary

These JSON files are templates. Do not commit live OAuth credentials or private mailbox traffic to this public repository.
