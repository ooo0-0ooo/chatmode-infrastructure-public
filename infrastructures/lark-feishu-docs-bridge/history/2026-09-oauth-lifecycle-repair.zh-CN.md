# OAuth 生命周期故障与修复 — 2026 年 9 月

**[English](2026-09-oauth-lifecycle-repair.md) | 中文**

本文记录一套此前已经完成真实验收的 Chat 模式 Lark/Feishu Bridge，在连续多天没有使用后出现的 production 故障，以及后续修复。

公开版本已去除真实仓库名、文档 ID、用户 ID、App ID、OAuth 值和 private logs。

## 故障现象

一份此前明确可读的基准 Mindnote 和另一份独立 Mindnote 同时失败：

```text
token_missing
need_user_authorization
```

由于已知基准文档也失败，因此可以排除“只是某一份文档分享设置/权限变化”。

## 关键纠错：不能把某一代 refresh expiry 当成整个授权的最终到期日

早期诊断曾错误地把历史 `refreshExpiresAt` 当成整条 user OAuth 的最终寿命。

production 历史后来证明：

- 9 月 9 日，known-good Mindnote 仍然正常读取；
- 9 月 10 日，另一份 Mindnote 仍然正常读取。

核对 Lark CLI 行为后确认：正常 user API 调用过程中会 rolling refresh，并保存新一代 access token / refresh token 和新的 refresh expiry。

所以历史 expiry 只代表某一代 token。

## 根因 1：旧版只在真实 user API 请求时 lazy refresh

旧版实际逻辑：

```text
有真实 user API 请求
  -> access token 需要 refresh
  -> CLI 刷新 token
```

没有 host-side lifecycle keeper。

连续多天完全没有 Lark user API 请求后，最后一代 refresh token 最终自然过期。production runtime 明确记录 refresh token expired 并清理 token，随后 user identity unavailable。

### 修复

auth watcher 增加：

- 周期性 token metadata 检查；
- `auth.health`；
- `auth.keepalive`；
- 可配置 refresh protection window；
- 必要时由本地主机走正常 Lark CLI refresh 路径。

修复后的 reference 默认：

- 每 6 小时检查一次；
- refresh expiry 前 72 小时进入保护窗。

这样不再依赖“用户刚好每几天至少使用一次 Lark”。

## 根因 2：旧 OAuth recovery 把 device credential 经 Chat/GitHub 搬运

旧流程：

```text
auth.start
  -> GitHub response 写 device_code
  -> Chat 读取 device_code
  -> Chat 再写 auth.finish(device_code)
  -> host 完成 exchange
```

问题：

1. 当前 Chat credential-safety 可能阻止把 OAuth credential 从一个 tool result 再转发到另一个 tool call；
2. 临时 device credential 可能进入 Git history，与预期 secret-handling model 冲突。

### 修复

新流程：

```text
auth.start / auth.start_all
  -> host 本地保存 device_code
  -> host 生成 opaque auth_session_id
  -> GitHub 只返回 verification_url + auth_session_id
  -> 用户在 Lark 官方页面批准
  -> Chat 发送 auth.finish_pending(auth_session_id)
  -> host 取本地 device_code
  -> host 完成 token exchange
  -> 删除本地 pending OAuth secret
```

mailbox 不再接受 `auth.finish(device_code)`。

## 根因 3：GitHub 源码更新不代表本机旧进程已经加载新版

修复过程中，Git 源码已经更新，但 production probe 仍报告旧 operation allowlist。

原因是 Windows 上旧 supervisor/watcher 进程仍驻留。

### 修复

installer 现在会：

- staging 新 runtime；
- syntax check；
- 全部检查通过后才替换；
- 停止旧 supervisor；
- 启动新版 supervisor/runtime。

## 重新验收

修复后的 private reference implementation 完成真实 production 回归：

- 新 host 识别 `auth.health`；
- OAuth start response 不再暴露 `device_code`；
- 用户在 Lark 官方页面授权；
- `auth.finish_pending` 成功；
- user token verify = ready / verified / valid；
- previously-known-good Mindnote 真实读取 PASS；
- 第二份独立 Mindnote 真实读取 PASS；
- `auth.keepalive` 在 production host 执行并返回 healthy。

## 尚需长期观察

keepalive policy / timer 已真实加载并执行成功。

但跨完整自然 refresh-token window 的多日 soak 无法用一次即时测试替代；长期部署仍应观察至少一次真实自动 token rotation。

## 通用经验

- 不要用某一代 token 的 expiry 推断整条 OAuth grant 的最终寿命；
- lazy refresh 会让“常驻集成”暗中依赖用户使用频率；
- 临时 OAuth credential 应只留在实际消费它的本地主机；
- 浏览器显示授权成功，不等于 host 已完成 token exchange；
- GitHub 源码更新后必须确认运行进程真的加载新版；
- 遇到“文档权限”假设时，应先用 previously-known-good 文档做对照实验。
