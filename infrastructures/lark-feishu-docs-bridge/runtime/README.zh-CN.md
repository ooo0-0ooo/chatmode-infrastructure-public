# 脱敏 Runtime 源码

**[English](README.md) | 中文**

本目录保存修复后的 Chat 模式 Lark/Feishu 文档 Bridge 的**脱敏 runtime 源码**。

它来自 2026-09 OAuth 生命周期故障后重新完成 production 验收的实现，但已去掉或参数化真实仓库名、分支名、本机路径、文档 ID、用户 ID、App ID，以及 live mailbox / OAuth 状态。

## 当前包含

- `ops-watcher-v2.mjs`
- `auth-watcher-v2.mjs`
- `supervisor-v2.mjs`
- `startup.mjs`
- `install-v2.mjs`

修复后的 auth watcher 包含：

- OAuth `device_code` 只保存在 host 本地；
- GitHub mailbox 只返回 opaque `auth_session_id`；
- `auth.finish_pending(auth_session_id)`；
- 删除旧 mailbox `auth.finish(device_code)`；
- `auth.health`；
- `auth.keepalive`；
- 周期性 token lifecycle 检查；
- 进入保护窗后的主动 refresh。

## 部署边界

**不要把这个 Public repo 当作真实 Lark 数据的 live mailbox。**

应新建 private runtime repo，并把这些文件复制到：

```text
bridge/client/
  ops-watcher-v2.mjs
  auth-watcher-v2.mjs
  supervisor-v2.mjs
  startup.mjs
  install-v2.mjs
```

再在 private repo 中建立 `bridge/v2/` mailbox，并使用 `../portable/.env.example` 配置环境。

## 当前 OAuth 恢复协议

```text
auth.start / auth.start_all
  -> 本地 host 保存 device_code
  -> GitHub 只返回 verification_url + opaque auth_session_id
  -> 用户在 Lark 官方页面授权
  -> Chat 发送 auth.finish_pending(auth_session_id)
  -> host 本地完成 device-code exchange
  -> 删除本地 pending OAuth secret
  -> auth.status 验证真实 user token
```

`device_code`、access token、refresh token 都不应提交到 Git。

## Keepalive

修复后的默认策略：

- 每 6 小时检查 token metadata；
- refresh expiry 进入 72 小时保护窗后开始主动保护；
- 只通过正常的 Lark CLI user-auth 路径 refresh；
- 所有 token material 都留在本地主机。

这样就不再依赖“用户刚好每几天至少使用一次 Lark”。

如果本地主机连续关机/离线时间超过上游 refresh-token 生命周期，仍可能需要重新浏览器 OAuth。

## Installer

`install-v2.mjs` 已参数化：

- `LARK_BRIDGE_SOURCE_REPO`
- `LARK_BRIDGE_SOURCE_BRANCH`
- `LARK_BRIDGE_LOCAL_DIR`

installer 会先 staging + syntax check，再替换 runtime，并停止旧 supervisor、启动新版。这个步骤很重要，因为 GitHub 源码变更不会自动替换已经驻留的本地旧进程。

## 安全不变量

本轮修复没有放宽原安全边界：

- 不提供 arbitrary shell；
- ops root allowlist；
- admin root 在 ops watcher 中禁止；
- mutation 必须同时满足 write intent + 当前消息明确授权；
- 禁止任意本机路径；
- 二进制只走受控 placeholder；
- current user-token scopes 与 app-enabled scopes 分开验证；
- pending result 防止 GitHub response 失败后重复执行 mutation。

## 验证等级

private reference implementation 已完成真实 production 回归：

- watcher 升级激活；
- host-local OAuth recovery；
- user-token verify；
- 两份独立真实 Mindnote 读取；
- 即时 `auth.keepalive` 执行。

跨完整自然 refresh window 的多日 soak 仍属于时间型验证，不能用一次即时测试替代。

完整故障/修复记录见 `../history/`。
