# Portable Lark / Feishu Bridge 配置

**[English](README.md) | 中文**

这个目录是把 `../runtime/` 中的脱敏 runtime 适配到 Private 部署环境时使用的公开配置层。

至少需要参数化：

- private runtime repo；
- runtime / asset branch 或 backend endpoint；
- installer 使用的 source repo / branch；
- ops/auth mailbox path；
- 本地安装目录；
- `gh` 路径；
- Lark CLI 路径；
- polling interval 和 payload limit；
- OAuth keepalive 检查周期与保护窗；
- startup/autostart 行为。

迁移时必须保留 runtime 的安全控制：

- command allowlist；
- 禁止 administrative operation；
- 显式 write intent；
- 当前消息 write authorization；
- mutation replay protection；
- 隔离的 binary temp storage；
- 验证 current user OAuth scopes；
- OAuth device credential 只留 host 本地；
- 不通过 Chat/Git 转发 raw device code。

runtime **源码**可以公开，本仓库已经包含；但承载 live mailbox state 和私有 Lark 数据的真实 runtime repo/backend 必须保持 Private。

绝不能提交：

- access token；
- refresh token；
- device code；
- host-local pending OAuth session；
- real app secret；
- live private mailbox traffic；
- private binary asset chunks。
