# Lark / Feishu Document Bridge — Chat Mode Usage Guide

> **Rights notice:** this repository has no open-source license. This guide explains how the infrastructure works and how an authorized user can deploy a compatible setup. It does not grant permission to reuse, modify, redistribute, or commercialize the source.

## What this public folder gives you

This public folder now includes a **sanitized runtime implementation plus deployment/integration guidance**.

The repaired watcher/supervisor source is published under `runtime/`; environment-specific defaults, live mailbox state, OAuth material, private binary assets, document/user/app identifiers, and production provenance remain excluded.

To use the bridge from an ordinary ChatGPT Chat, deploy the sanitized runtime into a **private runtime repository/backend** and configure it with your own GitHub/Lark environment. Do not use this public repository itself as the live mailbox for private Lark data.

The intended end state is:

```text
ChatGPT ordinary Chat
        |
        | GitHub connector
        v
Private GitHub runtime repository
        |
        | request/response mailbox
        v
Always-on local watcher / supervisor
        |
        | native Lark CLI
        v
Lark / Feishu OpenAPI + user OAuth
        |
        | text result / binary result
        v
Private GitHub runtime + artifact carrier
        |
        v
ChatGPT reads the verified result
```

Do **not** use this public repository as the live mailbox for private Lark data.

---

## 1. Prerequisites

You need all of the following before the bridge can work end to end.

### ChatGPT side

- A ChatGPT account with GitHub connected.
- The GitHub connection must be allowed to read and write the **private runtime repository** you create for this bridge.
- In normal use, the Chat should be able to read repository files, write mailbox JSON files, inspect workflow runs, and download workflow artifacts when binary/visual files are involved.

### GitHub side

- A private GitHub repository dedicated to the runtime, or a private repository with clearly separated runtime branches.
- One branch or backend area for request/response state.
- One branch or backend area for binary asset chunks / artifact transport.
- GitHub Actions enabled if you want Chat to receive real binary files as downloadable artifacts.
- A GitHub account or service identity available to the local host through GitHub CLI `gh`.

### Local host

The verified reference architecture used an always-on Windows machine. A compatible implementation can use another OS, but the public configuration and historical validation are closest to Windows.

Required local software:

- Node.js.
- Git.
- GitHub CLI `gh`.
- Lark official CLI package `@larksuite/cli`.
- A compatible bridge runtime containing:
  - an ops watcher;
  - an auth watcher;
  - a supervisor;
  - a startup entry;
  - mailbox parsing and response writing;
  - mutation safety checks;
  - optional binary/artifact transport support.

### Lark / Feishu side

- A Lark Developer application.
- App credentials stored locally or in an appropriate secret store, never committed to Git.
- User OAuth enabled for the document capabilities you actually need.
- `offline_access` when persistent refresh behavior is required.
- The user account that owns the OAuth grant must already have access to the target Lark/Feishu documents.

---

## 2. Create the private runtime repository

Create a **private** repository, for example:

```text
YOUR_ACCOUNT/lark-chat-bridge-runtime
```

A recommended logical layout is:

```text
bridge/
  LARK_ENTRY.md
  GLOBAL_CHAT_ROUTING.md
  v2/
    ops-request.json
    ops-response.json
    auth-request.json
    auth-response.json
  client/
    ops-watcher-v2.mjs
    auth-watcher-v2.mjs
    supervisor-v2.mjs
    startup.mjs
.github/
  workflows/
    lark-bridge-artifact-carrier.yml
```

Copy the sanitized watcher/supervisor files from `runtime/` into the private repository's `bridge/client/` directory. Keep all live mailbox traffic and OAuth state private.

A practical branch model is:

```text
main       -> protocol / source / routing files
runtime    -> live request / response mailbox state
assets     -> temporary binary chunks used by the artifact carrier
```

You can choose different names; just keep the source/history boundary clear and keep runtime state private.

Do not write every live request and response into a public branch.

---

## 3. Connect ChatGPT to the private runtime repository

Authorize your ChatGPT GitHub connection for the private runtime repository.

Before doing any Lark work, test that Chat can:

1. read a known text file from the private repository;
2. create or update a harmless mailbox file on the runtime branch;
3. read the updated file back;
4. inspect a GitHub Actions run if artifact transport is enabled.

If Chat can only read but cannot write, the bridge cannot submit requests.

If the repository was created after the GitHub app/connector was installed, make sure the new repository is included in the connector's repository access list.

---

## 4. Install the local dependencies

### 4.1 Node.js

Install a current supported Node.js LTS release and verify:

```powershell
node --version
npm --version
```

### 4.2 GitHub CLI

On Windows, one option is:

```powershell
winget install --id GitHub.cli --source winget
```

Then open a new terminal and verify:

```powershell
gh --version
gh auth login
gh auth status
```

The authenticated GitHub identity must have read/write access to the private runtime repository.

Also verify:

```powershell
gh repo view YOUR_ACCOUNT/lark-chat-bridge-runtime
```

### 4.3 Lark CLI

Install the official Lark CLI package:

```powershell
npm install -g @larksuite/cli
```

Verify that the CLI is available and record the actual executable path used by your runtime.

On Windows, prefer the package's native `lark-cli.exe` when available instead of relying on a PowerShell npm shim. Your runtime should call the executable directly and pass arguments as an argument array rather than constructing an arbitrary shell string.

---

## 5. Configure the Lark developer application and OAuth

Create or select a Lark Developer application for your bridge.

The exact application-console UI can change, but the deployment principles are stable:

- enable only the document capabilities you need;
- configure user OAuth rather than treating an app credential as the user's document identity;
- keep the app secret outside Git;
- never commit access tokens or refresh tokens;
- grant the app scopes required by the target document types;
- use the CLI's current OAuth flow to obtain a user authorization grant.

The important distinction is:

```text
Scopes enabled for the app
        !=
Scopes actually present on the current user access token
        !=
Permission from the user's current Chat message to modify a document
```

After OAuth, verify the **current user token**, not just the app configuration. A compatible runtime should perform the equivalent of:

```text
lark-cli auth status --verify
```

and inspect the real token status and scope set.

Do not treat a successful login page as proof that the required scope is actually present.

---

## 6. Configure the public `.env.example` for your private runtime

Start from:

```text
portable/.env.example
```

Copy it into your private runtime environment as `.env` or equivalent secret/config storage.

Example:

```text
LARK_BRIDGE_REPO=YOUR_ACCOUNT/lark-chat-bridge-runtime
LARK_BRIDGE_BRANCH=runtime
LARK_BRIDGE_ASSET_BRANCH=assets

LARK_BRIDGE_V2_OPS_REQUEST_PATH=bridge/v2/ops-request.json
LARK_BRIDGE_V2_OPS_RESPONSE_PATH=bridge/v2/ops-response.json
LARK_BRIDGE_V2_AUTH_REQUEST_PATH=bridge/v2/auth-request.json
LARK_BRIDGE_V2_AUTH_RESPONSE_PATH=bridge/v2/auth-response.json

GH_PATH=gh
LARK_CLI_PATH=C:\path\to\lark-cli.exe

LARK_BRIDGE_POLL_MS=5000
LARK_BRIDGE_OPS_MAX_OUTPUT=900000
LARK_BRIDGE_ASSET_CHUNK_CHARS=48000

LARK_BRIDGE_LOCAL_DIR=C:\lark-chat-bridge
```

Do not commit the real `.env` file.

The runtime must read these values instead of hard-coding a GitHub username, repository, Windows user directory, or application credential.

---

## 7. Implement the request / response mailbox contract

A compatible runtime needs two logical channels:

- **ops** — document and file operations;
- **auth** — OAuth status/start/finish operations.

Every request should have a fresh unique `request_id`. The watcher must write the same `request_id` into the response so Chat can distinguish the result of the current request from stale state.

A minimal ops request shape can look like:

```json
{
  "request_id": "2026-09-17T120000Z-example-001",
  "operation": "lark.cli",
  "intent": "read",
  "write_authorized": false,
  "args": ["<allowed-lark-cli-root>", "<subcommand>", "..."]
}
```

For a mutation, both of these must be true:

```json
{
  "intent": "write",
  "write_authorized": true
}
```

`write_authorized: true` must only be set when the user's **current Chat message** explicitly asks for the corresponding create/edit/delete/upload/move/permission change.

The watcher must independently detect mutation-like commands. If the request says `intent: "read"` but the actual command is a mutation, the watcher should reject it locally without calling Lark.

The watcher should also:

- allowlist supported Lark CLI roots;
- block administrative/arbitrary-shell roots from the ops channel;
- reject arbitrary local absolute paths supplied by Chat;
- isolate input/output files inside temporary directories;
- prevent replay of a successful mutation if GitHub response writing fails;
- bound output size, file count, and binary chunk size;
- write structured errors instead of silently exiting.

---

## 8. Separate auth operations from document operations

Do not expose unrestricted `auth`, `config`, `install`, or shell commands through the normal ops watcher.

The repaired auth watcher exposes a small typed surface:

```text
auth.status
auth.scopes
auth.start
auth.start_all
auth.finish_pending
auth.health
auth.keepalive
```

### OAuth recovery

Current flow:

```text
Chat detects invalid/missing user token
  -> auth.start / auth.start_all
  -> local host stores the Lark device_code locally
  -> runtime returns only the official verification_url + opaque auth_session_id
  -> user completes authorization in browser
  -> user tells Chat authorization is complete
  -> Chat sends auth.finish_pending(auth_session_id)
  -> local host completes the device-code exchange
  -> local pending OAuth secret is deleted
  -> auth.status verifies the real token and scopes
  -> original document task resumes
```

Never return the raw `device_code` to Chat or write it into Git. The old `auth.finish(device_code)` mailbox contract should not be used.

### Token lifecycle keeper

The repaired reference runtime checks local token metadata periodically. Its default policy is:

- check every 6 hours;
- when the access token needs refresh and the rotating refresh token is within 72 hours of expiry, trigger the normal verified Lark CLI refresh path locally;
- keep access/refresh token material on the host.

This prevents a long idle period from silently expiring the rotating refresh-token chain while the host is still running.

If the host itself is powered off/offline longer than the upstream refresh-token lifetime, a new browser OAuth may still be required.

Do not treat a successful browser authorization page as proof that the local host has completed token exchange. Verify with `auth.status`.

---

## 9. Start the watcher and supervisor

Place the private runtime in a stable local directory, not a temporary folder.

A recommended process model is:

```text
startup.mjs
   -> supervisor-v2.mjs
        -> ops-watcher-v2.mjs
        -> auth-watcher-v2.mjs
```

The supervisor should restart a watcher if it exits unexpectedly and should use a lock so multiple copies do not process the same mailbox simultaneously.

On Windows, an ordinary per-user startup mechanism can launch `node.exe` with `startup.mjs`. Keep the startup command simple; avoid embedding secrets in the startup entry.

After starting the runtime, verify the process stays alive for multiple consecutive requests rather than only handling one request.

---

## 10. Add binary / visual artifact transport if you need real images

Text and JSON can return through mailbox responses. Real images and other binary files need a separate path.

A compatible implementation can use the following pattern:

```text
Lark CLI downloads binary
  -> watcher stores it in an isolated temp directory
  -> watcher Base64-chunks it into a private assets branch
  -> a narrowly scoped GitHub Actions workflow reconstructs the file
  -> workflow uploads a short-retention artifact ZIP
  -> Chat downloads the artifact
  -> Chat opens the real image/file
```

Important safety properties:

- the workflow must not execute arbitrary code supplied in the request;
- validate `request_id`, output keys, and filenames;
- only read chunks from a fixed request-specific path;
- cap file count and total decoded size;
- use short artifact retention;
- clean up temporary branches/chunks after use;
- never upload private binary data to the public source repository.

A task that asks Chat to visually inspect an image is not complete merely because Chat received a file token, metadata, filename, or Base64 text. Chat must obtain and actually open the real file.

---

## 11. Create the routing files Chat reads first

Your private runtime repository should have a small stable entry file, for example:

```text
bridge/LARK_ENTRY.md
```

That file should point Chat to the complete routing/security protocol, for example:

```text
bridge/GLOBAL_CHAT_ROUTING.md
```

The routing protocol should tell Chat how to:

- generate a fresh request ID;
- choose ops vs auth;
- write and poll mailbox files;
- distinguish read vs write intent;
- require current-message authorization for mutations;
- process structured errors;
- handle binary outputs;
- verify writes by reading server state back;
- avoid opening the Lark webpage as a substitute for the bridge.

Keep these routing files in the **private runtime repository** if they contain environment-specific paths or operational details.

---

## 12. Use the bridge from a new ordinary Chat

Once the runtime is working, start a new Chat with an explicit first-hop instruction.

Recommended template:

```text
LARK BRIDGE: Your first tool call must use the connected GitHub repository to read YOUR_ACCOUNT/lark-chat-bridge-runtime, branch runtime, file bridge/LARK_ENTRY.md. Do not open, search, or browse any Lark/Feishu webpage. After reading the entry file, follow its routing and safety protocol for the task below.

<PASTE LARK/FEISHU URL HERE>
<DESCRIBE THE TASK HERE>
```

If your entry file lives on another branch, replace `runtime` with that branch.

The explicit first-hop instruction matters because a generic account-level instruction is not a reliable guarantee that a fresh Chat will choose GitHub before trying the document URL directly.

### Read example

```text
LARK BRIDGE: Your first tool call must use the connected GitHub repository to read YOUR_ACCOUNT/lark-chat-bridge-runtime, branch runtime, file bridge/LARK_ENTRY.md. Do not open, search, or browse any Lark/Feishu webpage. After reading the entry file, follow its routing and safety protocol for the task below.

https://example.larksuite.com/...
Read the first two levels of this document's structure and summarize them.
```

### Write example

```text
LARK BRIDGE: Your first tool call must use the connected GitHub repository to read YOUR_ACCOUNT/lark-chat-bridge-runtime, branch runtime, file bridge/LARK_ENTRY.md. Do not open, search, or browse any Lark/Feishu webpage. After reading the entry file, follow its routing and safety protocol for the task below.

https://example.larksuite.com/...
Change the document title to "Project Notes" and then read it back to verify the change.
```

A compatible routing protocol should only set `write_authorized: true` for the second example, because the current message explicitly requests a mutation.

---

## 13. Required smoke tests before real use

Do not treat the bridge as installed until all of these pass.

### GitHub transport

- Chat can read the entry file.
- Chat can write a fresh request.
- The watcher returns a matching `request_id`.
- Three requests in a row succeed without restarting the watcher.

### OAuth

- `auth.status --verify` reports a valid user token.
- The required real user-token scopes are present.
- OAuth recovery can be completed without exposing secrets in Git.

### Read

- Read one Mindnote or document structure.
- Read one Docx/document body.
- Read another supported document type you actually plan to use.

### Safety

- Send a mutation-like command marked as read and confirm the watcher refuses it locally.
- Confirm a normal read still works immediately after the rejected request.

### Write

Use a temporary or reversible target:

```text
read original state
  -> explicitly authorized write
  -> server read-back
  -> restore/delete
  -> final read-back
```

### Binary / image

- Download a real image or exported file.
- Confirm byte size is non-zero.
- Reconstruct it through the artifact path.
- Download the ZIP/artifact in Chat.
- Open the real file and visually inspect it.

---

## 14. What normal daily use should feel like

After setup, the user should normally only do two things:

1. start a fresh Lark-related Chat with the first-hop bridge prefix;
2. complete an official Lark OAuth page when the user token actually needs renewal or new scopes.

The user should not normally need to manually edit mailbox JSON, copy Base64 chunks, run Lark CLI commands, or restart watchers for each task.

If those manual steps are required for normal operation, the runtime is not yet integrated enough.

---

## 15. Troubleshooting

### Chat opens the Lark webpage instead of GitHub

Use the explicit current-message first-hop prefix shown above. Do not rely only on a saved generic instruction.

### Chat writes a request but nothing happens

Check:

```text
local supervisor running?
ops/auth watcher running?
correct private repo?
correct runtime branch?
gh authenticated?
gh has write access?
request path matches .env?
lock file stuck?
watcher log contains a parse/CLI error?
```

### OAuth page succeeded but writes still fail

Verify the current user token with `auth status --verify`. App-enabled scopes and current user-token scopes are different things.

### Mutation runs twice

Stop using the runtime until replay protection is fixed. A successful Lark mutation must be cached/idempotent enough that a failed GitHub response write does not cause the same mutation to execute again.

### Image task returns only metadata

The binary carrier is incomplete. The task is not visually verified until Chat downloads and opens the actual file.

### Watcher works once and then stops

Check supervisor restart behavior, lock handling, unhandled exceptions, and whether the watcher loop continues after both success and rejection responses.

---

## 16. Current maturity of this public package

This public package is currently best described as:

**sanitized runtime source + deployment specification + parameterized configuration layer**

It now includes the repaired watcher/supervisor runtime and installer source, but it is still **not a public live service** and must not be used as a mailbox for private Lark data.

To deploy it, copy the runtime source into a private runtime repository, configure your own GitHub/Lark environment, create private mailbox files, and complete your own OAuth and smoke tests.


---

## 17. September 2026 OAuth lifecycle repair

The current public runtime reflects a production repair completed after a long-idle OAuth failure.

The repair addressed:

- lazy-only refresh that allowed the rotating refresh token to expire during prolonged inactivity;
- temporary OAuth device credential forwarding through Chat/GitHub;
- stale local watcher processes continuing to run after source updates.

The repaired private reference implementation was revalidated with real OAuth recovery, user-token verification, two independent Mindnote reads, and an immediate keepalive check.

See:

- `runtime/README.md`
- `history/2026-09-oauth-lifecycle-repair.md`
