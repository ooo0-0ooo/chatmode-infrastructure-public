# Lark / Feishu 文档 Bridge — Public Source

**[English](README.md) | 中文**

本目录公开一套 Chat 模式受控读写 Lark/Feishu 文档 Bridge 的**脱敏、可移植版本**。

现在已经包含修复后的 watcher/supervisor runtime 源码（`runtime/`），以及部署指南、参数化配置、安全边界和脱敏后的故障/修复历史。

Public repo 仍然刻意不包含 live private state：真实 mailbox 流量、OAuth credential、binary asset、真实 document ID、user/app identifier、private logs、截图和项目特定 provenance。

## 2026 年 9 月这次迭代修了什么

此前已经验收通过的 Bridge 在长时间闲置后失效，根因包括：

- token 只在真实 user API 调用时 lazy refresh，Bridge 闲置时 rotating refresh token 可能自然过期；
- 旧 OAuth recovery 把临时 `device_code` 经 GitHub/Chat 转发，不符合当前 credential-safety，也不应进入 Git history；
- GitHub 源码更新后，本机已经运行的旧 watcher 不会自动加载新版。

修复后的 runtime 改为：

- host-local `device_code`；
- opaque `auth_session_id`；
- `auth.finish_pending(auth_session_id)`；
- `auth.health`；
- `auth.keepalive`；
- 周期性 token lifecycle 检查；
- 可配置 refresh protection window；
- runtime 激活后 installer 主动重启旧 supervisor。

详见：

- [runtime/](runtime/)
- [故障与修复记录](history/2026-09-oauth-lifecycle-repair.zh-CN.md)
- [English usage guide](USAGE_GUIDE.md)
- [中文使用指南](USAGE_GUIDE.zh-CN.md)

## Public 中包含

- 脱敏后的 runtime source；
- 通用架构和迁移说明；
- 参数化环境变量示例；
- 安全 gate / 权限模型；
- OAuth lifecycle / recovery 设计；
- troubleshooting / validation 指南；
- 脱敏后的故障、根因、修复过程。

## 刻意保持 Private 的内容

- live `ops-request`、`ops-response`、`auth-request`、`auth-response` 流量；
- access token、refresh token、device code、host-local pending OAuth session、app secret；
- binary asset chunks 和重建后的私有文件；
- 真实 document ID、user ID、app ID、截图、日志和 private QA evidence；
- 绑定具体环境的 production provenance。

## Runtime 隔离

Public `runtime/` 可以作为源码使用，但真实 Bridge 必须部署到 **Private runtime repo/backend**。不要把 production live mailbox 指向这个 Public repo。

参数化配置示例见 `portable/`。
