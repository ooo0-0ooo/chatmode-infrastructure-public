# Lark / Feishu 文档 Bridge — Chat 模式使用指南

**[English](USAGE_GUIDE.md) | 中文**

> **权利声明：** 本仓库没有开源 License。本指南用于说明这套基础设施如何工作，以及获得授权的使用者如何部署兼容实现，不构成对源码复制、修改、再分发或商用的授权。

## 这个 Public 目录提供什么

这个 Public 目录现在包含**脱敏 runtime 实现 + 部署/接入指南**。

修复后的 watcher/supervisor 源码已经发布在 `runtime/`；绑定具体环境的默认值、live mailbox state、OAuth material、private binary asset、真实 document/user/app identifier 和 production provenance 仍然不公开。

要让 Bridge 真正在普通 ChatGPT Chat 中可用，应把脱敏 runtime 部署到你自己的 **Private runtime repo/backend**，并配置自己的 GitHub/Lark 环境。不要直接把这个 Public repo 当作私有 Lark 数据的 live mailbox。

目标状态：

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

**不要**把这个 Public repo 作为私有 Lark 数据的实时 mailbox。

---

## 1. 前置条件

要做到端到端可用，需要以下条件。

### ChatGPT 侧

- ChatGPT 已连接 GitHub。
- GitHub connection 被允许读写你为 Bridge 创建的 **Private runtime repo**。
- 正常使用时，Chat 应能够读取 repo 文件、写 mailbox JSON、查看 workflow run；涉及 binary/visual 文件时，还应能够下载 workflow artifact。

### GitHub 侧

- 一个专用于 runtime 的 Private repo，或一个明确隔离 runtime branch 的 Private repo。
- 一块 branch/backend 区域保存 request/response state。
- 一块 branch/backend 区域保存 binary asset chunks / artifact transport。
- 如果希望 Chat 获得真实 binary file，需要启用 GitHub Actions。
- 本地主机上的 GitHub CLI `gh` 需要使用一个对该 Private repo 有权限的 GitHub account/service identity。

### Local host

已验证 reference architecture 使用 always-on Windows 主机。兼容实现可以使用其他 OS，但现有 Public 配置和历史验证最接近 Windows。

本机需要：

- Node.js；
- Git；
- GitHub CLI `gh`；
- Lark 官方 CLI package `@larksuite/cli`；
- 一个兼容 Bridge runtime，至少包含：
  - ops watcher；
  - auth watcher；
  - supervisor；
  - startup entry；
  - mailbox parsing / response writing；
  - mutation safety checks；
  - 可选 binary/artifact transport。

### Lark / Feishu 侧

- Lark Developer application；
- App credential 保存在本地或安全 secret store，绝不进 Git；
- 对实际需要的文档能力启用 user OAuth；
- 如果需要长期 refresh，启用 `offline_access`；
- 发起 OAuth 的 user account 本身必须已经拥有目标 Lark/Feishu 文档访问权限。

---

## 2. 创建 Private Runtime Repo

创建一个 **Private** repo，例如：

```text
YOUR_ACCOUNT/lark-chat-bridge-runtime
```

建议逻辑结构：

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

把 `runtime/` 中的脱敏 watcher/supervisor 文件复制到 Private repo 的 `bridge/client/`。所有 live mailbox traffic 和 OAuth state 始终保持 Private。

一种实用 branch 模型：

```text
main       -> protocol / source / routing files
runtime    -> live request / response mailbox state
assets     -> temporary binary chunks used by the artifact carrier
```

名称可以不同，但必须保证 source/history 边界清楚，runtime state 始终 Private。

不要把每一次 live request/response 写进 Public branch。

---

## 3. 把 ChatGPT 连接到 Private Runtime Repo

给 ChatGPT GitHub connection 授权访问该 Private runtime repo。

在做任何 Lark 操作之前，先验证 Chat 可以：

1. 读取 Private repo 中一个已知文本文件；
2. 在 runtime branch 创建或更新一个无害 mailbox file；
3. 把更新后的文件重新读回；
4. 如果启用了 artifact transport，能够查看相关 GitHub Actions run。

如果 Chat 只能读不能写，Bridge 无法提交 request。

如果 repo 是在 GitHub app/connector 安装后新建的，记得把它加入 connector 的 repository access list。

---

## 4. 安装本地依赖

### 4.1 Node.js

安装当前支持的 Node.js LTS：

```powershell
node --version
npm --version
```

### 4.2 GitHub CLI

Windows 可使用：

```powershell
winget install --id GitHub.cli --source winget
```

重新打开 terminal 后：

```powershell
gh --version
gh auth login
gh auth status
```

当前 GitHub identity 必须对 Private runtime repo 有 read/write 权限。

再验证：

```powershell
gh repo view YOUR_ACCOUNT/lark-chat-bridge-runtime
```

### 4.3 Lark CLI

安装官方 package：

```powershell
npm install -g @larksuite/cli
```

确认 CLI 可用，并记录 runtime 实际调用的 executable path。

Windows 上如果 package 提供原生 `lark-cli.exe`，优先使用原生 exe，而不是依赖 PowerShell npm shim。Runtime 应直接调用 executable，并使用 argument array 传参，而不是拼接任意 shell string。

---

## 5. 配置 Lark Developer App 与 OAuth

创建或选择一个用于 Bridge 的 Lark Developer App。

应用后台 UI 可能变化，但部署原则稳定：

- 只开启实际需要的 document capabilities；
- 使用 user OAuth，而不是把 app credential 当成用户文档身份；
- app secret 不进 Git；
- access token / refresh token 不进 Git；
- 为目标文档类型开启需要的 scopes；
- 使用 CLI 当前支持的 OAuth flow 获得 user authorization grant。

必须区分：

```text
Scopes enabled for the app
        !=
Scopes actually present on the current user access token
        !=
Permission from the user's current Chat message to modify a document
```

OAuth 完成后，要验证**当前 user token**，而不是只看 app configuration。Compatible runtime 应执行等价于：

```text
lark-cli auth status --verify
```

并检查真实 token status 和 scope set。

授权网页显示成功，不等于当前 token 一定包含需要的 scope。

---

## 6. 用 Public `.env.example` 配置 Private Runtime

从：

```text
LARK_BRIDGE_REPO=YOUR_ACCOUNT/lark-chat-bridge-runtime
LARK_BRIDGE_BRANCH=runtime
LARK_BRIDGE_ASSET_BRANCH=assets

LARK_BRIDGE_SOURCE_REPO=YOUR_ACCOUNT/lark-chat-bridge-runtime
LARK_BRIDGE_SOURCE_BRANCH=runtime

LARK_BRIDGE_V2_OPS_REQUEST_PATH=bridge/v2/ops-request.json
LARK_BRIDGE_V2_OPS_RESPONSE_PATH=bridge/v2/ops-response.json
LARK_BRIDGE_V2_AUTH_REQUEST_PATH=bridge/v2/auth-request.json
LARK_BRIDGE_V2_AUTH_RESPONSE_PATH=bridge/v2/auth-response.json

GH_PATH=gh
LARK_CLI_PATH=C:\\path\\to\\lark-cli.exe

LARK_BRIDGE_POLL_MS=5000
LARK_BRIDGE_OPS_MAX_OUTPUT=900000
LARK_BRIDGE_ASSET_CHUNK_CHARS=48000

LARK_BRIDGE_AUTH_KEEPALIVE_CHECK_MS=21600000
LARK_BRIDGE_AUTH_KEEPALIVE_REFRESH_BEFORE_MS=259200000
LARK_BRIDGE_AUTH_KEEPALIVE_INITIAL_DELAY_MS=30000

LARK_BRIDGE_LOCAL_DIR=C:\\lark-chat-bridge
```

复制到 Private runtime 环境的 `.env` 或等价 secret/config storage。

示例：

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

不要提交真实 `.env`。

Runtime 必须读取这些配置，而不是硬编码 GitHub username、repo、Windows user directory 或 app credential。

---

## 7. 实现 Request / Response Mailbox Contract

兼容 runtime 至少需要两个逻辑通道：

- **ops** — document/file operations；
- **auth** — OAuth status/start/finish。

每个 request 都应生成 fresh unique `request_id`。Watcher 写 response 时必须使用同一个 `request_id`，让 Chat 能把当前结果和 stale state 区分开。

最小 ops request 可以类似：

```json
{
  "request_id": "2026-09-17T120000Z-example-001",
  "operation": "lark.cli",
  "intent": "read",
  "write_authorized": false,
  "args": ["<allowed-lark-cli-root>", "<subcommand>", "..."]
}
```

Mutation 时两项必须同时成立：

```json
{
  "intent": "write",
  "write_authorized": true
}
```

只有用户**当前 Chat 消息**明确要求对应 create/edit/delete/upload/move/permission change 时，才能设置 `write_authorized: true`。

Watcher 必须自己独立检测 mutation-like command。如果 request 声明 `intent: "read"`，但实际 command 是 mutation，watcher 应在本地拒绝，不触达 Lark。

Watcher 还应：

- allowlist 支持的 Lark CLI roots；
- 从 ops channel 阻止 administrative/arbitrary-shell roots；
- 拒绝 Chat 提供任意本地 absolute path；
- 在临时目录中隔离 input/output files；
- 防止 GitHub response 写入失败导致成功 mutation 被重复执行；
- 限制 output size、file count 和 binary chunk size；
- 输出 structured error，而不是静默退出。

---

## 8. Auth Operations 与 Document Operations 分离

普通 ops watcher 不要暴露 unrestricted `auth`、`config`、`install` 或 shell command。

修复后的 auth watcher 只暴露小型 typed surface：

```text
auth.status
auth.scopes
auth.start
auth.start_all
auth.finish_pending
auth.health
auth.keepalive
```

### OAuth 恢复

当前流程：

```text
Chat 检测 user token invalid/missing
  -> auth.start / auth.start_all
  -> local host 本地保存 Lark device_code
  -> runtime 只返回官方 verification_url + opaque auth_session_id
  -> 用户在浏览器完成授权
  -> 用户告诉 Chat 已授权
  -> Chat 发送 auth.finish_pending(auth_session_id)
  -> local host 本地完成 device-code exchange
  -> 删除本地 pending OAuth secret
  -> auth.status 验证真实 token / scopes
  -> 继续原 document task
```

不要把 raw `device_code` 返回给 Chat，也不要写进 Git。旧的 `auth.finish(device_code)` mailbox contract 不应继续使用。

### Token lifecycle keeper

修复后的 reference runtime 会周期性检查本地 token metadata。默认策略：

- 每 6 小时检查一次；
- access token 需要 refresh 且 rotating refresh token 距离到期不足 72 小时时，在本地主机触发正常且已验证的 Lark CLI refresh 路径；
- access/refresh token material 始终留在 host。

这样可以避免 host 明明一直在线，但因为长时间没有 Lark document request 而让 rotating refresh-token 链自然断掉。

如果 host 自身连续关机/离线时间超过上游 refresh-token 生命周期，仍可能需要重新 browser OAuth。

浏览器授权页显示成功，不等于 local host 已经完成 token exchange；必须再用 `auth.status` 验证。

---

## 9. 启动 Watcher 与 Supervisor

Private runtime 放在稳定的本地目录，不要使用临时目录。

推荐 process model：

```text
startup.mjs
   -> supervisor-v2.mjs
        -> ops-watcher-v2.mjs
        -> auth-watcher-v2.mjs
```

Watcher 异常退出时，supervisor 应能重启；同时使用 lock 防止多个进程重复消费同一个 mailbox。

Windows 可以用普通 per-user startup mechanism 让 `node.exe` 启动 `startup.mjs`。Startup command 保持简单，不要把 secret 嵌进去。

启动后应连续处理多次 request，不能只成功处理一次就退出。

---

## 10. 需要真实图片时加入 Binary / Visual Artifact Transport

Text/JSON 可以通过 mailbox response 返回。真实图片和其他 binary file 需要单独传输路径。

兼容实现可以使用：

```text
Lark CLI downloads binary
  -> watcher stores it in an isolated temp directory
  -> watcher Base64-chunks it into a private assets branch
  -> a narrowly scoped GitHub Actions workflow reconstructs the file
  -> workflow uploads a short-retention artifact ZIP
  -> Chat downloads the artifact
  -> Chat opens the real image/file
```

关键安全要求：

- workflow 不执行 request 中提供的任意代码；
- 校验 `request_id`、output key、filename；
- 只从固定 request-specific path 读取 chunks；
- 限制 file count 和 decoded total size；
- artifact retention 尽量短；
- 使用后清理临时 branch/chunk；
- 私有 binary data 绝不能上传到 Public source repo。

如果任务要求 Chat “看图”，只拿到 file token、metadata、filename 或 Base64 text 不算完成；Chat 必须真正获得并打开实际文件。

---

## 11. 创建 Chat 第一跳读取的 Routing Files

Private runtime repo 应有一个稳定、很小的入口文件，例如：

```text
bridge/LARK_ENTRY.md
```

它再指向完整 routing/security protocol，例如：

```text
bridge/GLOBAL_CHAT_ROUTING.md
```

Routing protocol 应告诉 Chat：

- 如何生成 fresh request ID；
- 如何选择 ops/auth；
- 如何写入和轮询 mailbox；
- 如何区分 read/write intent；
- mutation 必须要求 current-message authorization；
- 如何处理 structured error；
- 如何处理 binary output；
- 如何通过 server read-back 验证 write；
- 不能用“打开 Lark 网页”替代 Bridge。

如果 routing file 含环境特定 path/operation detail，应放在 **Private runtime repo**。

---

## 12. 从一个全新的普通 Chat 使用 Bridge

Runtime 可用后，新建 Chat，并在第一条消息给出明确 first-hop instruction。

推荐模板：

```text
LARK BRIDGE: Your first tool call must use the connected GitHub repository to read YOUR_ACCOUNT/lark-chat-bridge-runtime, branch runtime, file bridge/LARK_ENTRY.md. Do not open, search, or browse any Lark/Feishu webpage. After reading the entry file, follow its routing and safety protocol for the task below.

<PASTE LARK/FEISHU URL HERE>
<DESCRIBE THE TASK HERE>
```

如果 entry file 在其他 branch，把 `runtime` 替换为对应 branch。

显式 first-hop 很重要，因为 generic account-level instruction 并不能可靠保证 fresh Chat 会先走 GitHub，而不是直接尝试打开 document URL。

### Read 示例

```text
LARK BRIDGE: Your first tool call must use the connected GitHub repository to read YOUR_ACCOUNT/lark-chat-bridge-runtime, branch runtime, file bridge/LARK_ENTRY.md. Do not open, search, or browse any Lark/Feishu webpage. After reading the entry file, follow its routing and safety protocol for the task below.

https://example.larksuite.com/...
Read the first two levels of this document's structure and summarize them.
```

### Write 示例

```text
LARK BRIDGE: Your first tool call must use the connected GitHub repository to read YOUR_ACCOUNT/lark-chat-bridge-runtime, branch runtime, file bridge/LARK_ENTRY.md. Do not open, search, or browse any Lark/Feishu webpage. After reading the entry file, follow its routing and safety protocol for the task below.

https://example.larksuite.com/...
Change the document title to "Project Notes" and then read it back to verify the change.
```

只有第二个 example 因为当前消息明确要求 mutation，routing protocol 才应设置 `write_authorized: true`。

---

## 13. 正式使用前必须通过的 Smoke Tests

以下全部 PASS 之前，不应把 Bridge 视为安装完成。

### GitHub Transport

- Chat 能读 entry file；
- Chat 能写 fresh request；
- watcher 返回 matching `request_id`；
- 连续 3 个 request 成功，且不需要 restart watcher。

### OAuth

- `auth.status --verify` 返回 valid user token；
- 当前真实 user-token 包含需要的 scopes；
- OAuth recovery 不暴露 secret 到 Git。

### Read

- 读取一个 Mindnote/document structure；
- 读取一个 Docx/document body；
- 再读取一种你实际准备使用的 supported document type。

### Safety

- 发送一个 mutation-like command，但标记为 read，确认 watcher 在本地拒绝；
- 拒绝后立刻发送正常 read，确认 watcher 仍正常工作。

### Write

使用临时或可逆目标：

```text
read original state
  -> explicitly authorized write
  -> server read-back
  -> restore/delete
  -> final read-back
```

### Binary / Image

- 下载真实图片或 exported file；
- 确认 byte size 非 0；
- 通过 artifact path 重建；
- Chat 下载 ZIP/artifact；
- Chat 打开真实文件并实际视觉检查。

---

## 14. 正常日常使用应该是什么体验

配置完成后，用户日常通常只需要做两件事：

1. 新建 Lark 相关 Chat 时，在第一条消息使用 first-hop bridge prefix；
2. 真实 user token 需要续期或补 scope 时，完成官方 Lark OAuth 页面。

正常情况下，用户不应该每次手动编辑 mailbox JSON、复制 Base64 chunk、运行 Lark CLI 或重启 watcher。

如果这些人工步骤仍然是日常必需，说明 runtime 的集成程度还不够。

---

## 15. 故障排查

### Chat 打开了 Lark 网页，而不是先走 GitHub

使用前文明确写在**当前消息**里的 first-hop prefix，不要只依赖保存的 generic instruction。

### Chat 写了 request，但没有任何响应

检查：

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

### OAuth 页面成功，但 write 仍失败

用 `auth status --verify` 验证当前 user token。App-enabled scopes 和当前 user-token scopes 不是一回事。

### Mutation 执行了两次

立即停止使用 runtime，直到 replay protection 修复。成功的 Lark mutation 必须有足够 idempotency/cache，不能因为 GitHub response write 失败就再次执行同一 mutation。

### 图片任务只返回 metadata

说明 binary carrier 不完整。Chat 下载并打开真实文件之前，视觉任务不能算验证完成。

### Watcher 只工作一次就停了

检查 supervisor restart、lock handling、unhandled exception，以及 watcher loop 是否在 success/rejection response 后继续运行。

---

## 16. 当前 Public Package 的成熟度

目前最准确的描述是：

**脱敏 runtime source + deployment specification + parameterized configuration layer**

Public repo 现在已经包含：

- repaired ops/auth watcher；
- supervisor / startup；
- 参数化 installer；
- mailbox / routing templates；
- artifact carrier template；
- portable environment example；
- 故障、根因、修复与验收说明。

但它仍然**不是 Public live service**，也不能直接承载你的私有 Lark mailbox / OAuth state。

部署时仍需：

1. 创建 Private runtime repo；
2. 把 `runtime/` 和 `bridge/` 模板复制进去；
3. 配置自己的 GitHub/Lark 环境；
4. 建立 Private mailbox / asset branch；
5. 完成 OAuth；
6. 跑 smoke tests / reversible write / real image artifact 验收。

所以它已经从“只有 specification”升级为“可公开分发的脱敏实现”，但 live data 与 secret 边界仍必须保持 Private。

---

## 17. 2026 年 9 月 OAuth 生命周期修复

当前 Public runtime 已包含一次真实 production 长期闲置 OAuth 故障后的修复。

本轮处理了：

- 只有 lazy refresh，导致长期不使用时 rotating refresh token 可能自然过期；
- 临时 OAuth device credential 经 Chat/GitHub 转发；
- GitHub source 更新后本机旧 watcher 仍继续运行。

修复后的 private reference implementation 已经用真实 OAuth recovery、user-token verify、两份独立 Mindnote read 和即时 keepalive 检查重新验收。

详见：

- `runtime/README.zh-CN.md`
- `history/2026-09-oauth-lifecycle-repair.zh-CN.md`
