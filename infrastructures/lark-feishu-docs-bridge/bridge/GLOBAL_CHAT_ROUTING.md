# Global Chat routing for Lark / Feishu — public template

Copy this file into the **private runtime repository** used by Chat and the local watcher.

## Mandatory route

When the user explicitly provides a Lark/Feishu resource and asks to work with it:

1. use the private GitHub bridge, not anonymous webpage browsing;
2. generate a fresh `request_id`;
3. choose ops vs auth mailbox;
4. do not mutate unless the user's **current message** explicitly asks for that mutation;
5. after any write, read server state back to verify;
6. for visual tasks, obtain and open the real binary file before making visual claims.

## Ops request

Read example:

```json
{
  "request_id": "chatgpt-YYYYMMDD-HHMM-read-01",
  "operation": "lark.cli",
  "intent": "read",
  "args": ["mindnotes", "nodes", "list", "--mindnote-id", "<token>"]
}
```

Write example:

```json
{
  "request_id": "chatgpt-YYYYMMDD-HHMM-write-01",
  "operation": "lark.cli",
  "intent": "write",
  "write_authorized": true,
  "args": ["<allowed-root>", "<explicit-mutating-subcommand>", "<target>"]
}
```

`write_authorized: true` is only valid when the current user message explicitly requests the mutation.

## OAuth

Use the dedicated auth watcher. Current operations:

- `auth.status`
- `auth.scopes`
- `auth.start`
- `auth.start_all`
- `auth.finish_pending`
- `auth.health`
- `auth.keepalive`

Current recovery flow:

```text
auth.start / auth.start_all
  -> host stores device_code locally
  -> GitHub returns verification_url + opaque auth_session_id
  -> user approves official Lark page
  -> Chat sends auth.finish_pending(auth_session_id)
  -> host completes token exchange locally
  -> auth.status verifies the real user token
```

Never put raw `device_code`, access token, or refresh token into Git.

App-enabled scopes are not the same as current user-token scopes. Verify the real token.

## Token lifecycle

The repaired reference runtime checks token state periodically and can refresh before the rotating refresh token expires. Default reference policy:

- check every 6 hours;
- protection window: 72 hours.

If the host is offline beyond the upstream refresh-token lifetime, browser OAuth may still be required.

## Large structured documents

Filter/count at the CLI/source layer when possible. Do not pull very large JSON into Chat and then assume a truncated UI representation is complete.

## Binary / visual output

Use controlled output placeholders and a private asset branch. For real image inspection:

1. Lark CLI downloads the real file;
2. watcher chunks it into the private asset transport;
3. a narrowly scoped artifact-carrier workflow reconstructs it;
4. Chat downloads the artifact;
5. Chat opens the real file.

A token, filename, dimensions, or Base64 text is not proof that Chat actually saw the image.

## Security boundary

- allowlist Lark CLI roots;
- block admin roots in ops;
- no arbitrary shell;
- no arbitrary local paths from Chat;
- raw mutating API methods count as writes;
- mutation requires `intent=write` + `write_authorized=true`;
- keep OAuth secrets host-local;
- cache completed results so GitHub response retries do not replay Lark mutations.
