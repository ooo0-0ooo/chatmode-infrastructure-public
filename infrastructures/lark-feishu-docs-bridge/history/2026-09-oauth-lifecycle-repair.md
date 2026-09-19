# OAuth lifecycle incident and repair — September 2026

**English | [中文](2026-09-oauth-lifecycle-repair.zh-CN.md)**

This document records a production failure discovered after a previously validated Chat-mode Lark/Feishu bridge had been idle for several days.

All environment-specific repository names, document identifiers, user identifiers, application identifiers, OAuth values, and private logs have been removed.

## What failed

A previously known-good Mindnote and a second independent Mindnote both failed with:

```text
token_missing
need_user_authorization
```

Because the known-good document also failed, the problem was not isolated to one document's share settings or permissions.

## Important correction: the authorization did not simply expire on the first recorded refresh-expiry date

An early diagnosis incorrectly treated one historical `refreshExpiresAt` value as the final lifetime of the whole authorization.

Production history later showed:

- the known-good Mindnote still read successfully on September 9;
- another Mindnote still read successfully on September 10.

Inspection of the Lark CLI behavior confirmed rolling refresh: when user API calls continue, the CLI can replace both access and refresh tokens and calculate a new refresh expiry.

The historical expiry value therefore represented only one token generation.

## Root cause 1: refresh happened only when real user API work occurred

The old bridge relied on lazy refresh:

```text
real user API request
  -> access token needs refresh
  -> CLI refreshes tokens
```

There was no host-side lifecycle keeper.

After a long idle period, the last refresh token eventually expired. The production runtime explicitly logged that the refresh token had expired and was being cleared, after which user identity became unavailable.

### Repair

The auth watcher now:

- checks token metadata periodically;
- exposes `auth.health`;
- exposes `auth.keepalive`;
- uses a configurable refresh-protection window;
- triggers the normal verified Lark CLI refresh path on the local host when needed.

The repaired reference defaults are:

- check every 6 hours;
- protection window: 72 hours before refresh expiry.

This removes the hidden requirement that the user must happen to use Lark every few days.

## Root cause 2: the old OAuth recovery protocol forwarded a device credential through Chat/GitHub

The old flow was:

```text
auth.start
  -> GitHub response contains device_code
  -> Chat reads device_code
  -> Chat sends auth.finish(device_code)
  -> local host exchanges it
```

That design had two problems:

1. current Chat credential-safety can block forwarding an OAuth credential from one tool result into another tool call;
2. the temporary device credential could enter Git history, conflicting with the intended secret-handling model.

### Repair

The new flow is:

```text
auth.start / auth.start_all
  -> local host stores device_code locally
  -> host generates opaque auth_session_id
  -> GitHub response contains verification_url + auth_session_id
  -> user approves official Lark page
  -> Chat sends auth.finish_pending(auth_session_id)
  -> host retrieves local device_code
  -> host completes token exchange
  -> host deletes pending OAuth secret
```

The mailbox no longer accepts `auth.finish(device_code)`.

## Root cause 3: source updates do not automatically replace running processes

During the repair, the Git source was updated but a production probe still reported the old auth operation list.

The reason: the old supervisor/watcher process was still resident on the Windows host.

### Repair

The installer now:

- stages new runtime files;
- syntax-checks them;
- replaces files only after checks pass;
- stops the existing supervisor;
- starts the repaired supervisor/runtime.

## Revalidation

The repaired private reference implementation was then validated with real production operations:

- upgraded host recognized new `auth.health`;
- OAuth start response no longer exposed `device_code`;
- user approved the official Lark authorization page;
- `auth.finish_pending` completed successfully;
- user token verification returned ready/verified/valid;
- a previously known-good Mindnote read succeeded;
- a second independent Mindnote read succeeded;
- `auth.keepalive` executed on the production host and returned healthy.

## Remaining time-dependent validation

The keepalive policy and timer are loaded and have executed successfully.

However, a full multi-day soak through a natural refresh-token window cannot be replaced by an instantaneous test. Long-running deployments should still observe at least one real automatic token rotation in production logs.

## General lessons

- Do not infer a whole OAuth grant's lifetime from one token generation's expiry timestamp.
- If refresh is lazy, an "always-on" integration may still silently depend on frequent user activity.
- Temporary OAuth credentials should remain local to the host that consumes them.
- A browser authorization success page is not proof that the local runtime has completed token exchange.
- Updating repository source is not enough; verify that the running process has actually loaded the new version.
- A document-permission hypothesis should be tested against a previously known-good document before changing sharing settings.
