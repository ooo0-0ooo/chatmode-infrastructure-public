# Sanitized runtime source

**English | [中文](README.zh-CN.md)**

This directory contains the sanitized runtime source for the repaired Chat-mode Lark/Feishu document bridge.

It is derived from the production implementation that was revalidated after the 2026-09 OAuth lifecycle incident, but all environment-specific repository names, branch names, local paths, document IDs, user IDs, app IDs, and live mailbox/OAuth state are excluded or parameterized.

## Included runtime

- `ops-watcher-v2.mjs`
- `auth-watcher-v2.mjs`
- `supervisor-v2.mjs`
- `startup.mjs`
- `install-v2.mjs`
- `activate-latest-v2.cmd`

The repaired auth watcher implements:

- host-local OAuth `device_code` storage;
- opaque `auth_session_id` returned through the mailbox;
- `auth.finish_pending(auth_session_id)`;
- no mailbox `auth.finish(device_code)`;
- `auth.health`;
- `auth.keepalive`;
- periodic token lifecycle checks;
- proactive refresh inside the configured protection window.

## Important deployment boundary

Do not use this public repository as the live mailbox for private Lark data.

Create a private runtime repository and place these files under:

```text
bridge/client/
  ops-watcher-v2.mjs
  auth-watcher-v2.mjs
  supervisor-v2.mjs
  startup.mjs
  install-v2.mjs
```

Then create private `bridge/v2/` mailbox files and configure the environment using `../portable/.env.example`.

## OAuth recovery contract

Current flow:

```text
auth.start / auth.start_all
  -> Windows/local host stores device_code locally
  -> GitHub mailbox returns verification_url + opaque auth_session_id
  -> user approves the official Lark page
  -> Chat sends auth.finish_pending(auth_session_id)
  -> local host completes the device-code exchange
  -> local pending OAuth secret is deleted
  -> auth.status verifies the real user token
```

The `device_code`, access token, and refresh token must not be committed to Git.

## Keepalive behavior

The default repaired reference policy is:

- check token metadata every 6 hours;
- begin active protection when refresh expiry is within 72 hours;
- refresh only through the normal Lark CLI user-auth flow;
- keep all token material on the local host.

This removes the old hidden dependency on "the user happens to use Lark at least once every few days."

If the local host is powered off or offline longer than the upstream refresh-token lifetime, a new browser OAuth may still be required.

## Installer

`install-v2.mjs` is parameterized with:

- `LARK_BRIDGE_SOURCE_REPO`
- `LARK_BRIDGE_SOURCE_BRANCH`
- `LARK_BRIDGE_LOCAL_DIR`

It stages and syntax-checks runtime files before activation, stops the old supervisor, then starts the new runtime. This matters because changing source files in Git does not automatically replace an already-running local process.

## Security invariants

The repaired runtime does not relax the existing safety boundary:

- no arbitrary shell execution;
- ops roots are allowlisted;
- administrative roots are blocked from the ops watcher;
- mutation requires both write intent and current-message authorization;
- direct arbitrary local paths are blocked;
- binary input/output goes through controlled placeholders;
- current user-token scopes must be verified separately from app-enabled scopes;
- pending results prevent accidental mutation replay after GitHub response failures.

## Validation level

The private reference implementation was production-revalidated for:

- upgraded watcher activation;
- host-local OAuth recovery;
- user-token verification;
- two independent real Mindnote reads;
- immediate `auth.keepalive` execution.

A full multi-day soak through a natural refresh window remains a time-dependent validation, not something that can be simulated by a single immediate test.

See the public incident/repair record in `../history/`.
