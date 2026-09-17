# Portable Lark / Feishu Bridge 配置

**[English](README.md) | 中文**

这个目录是把私有 Lark/Feishu Bridge 实现迁移/适配到新环境时使用的公开配置层。

至少需要参数化：

- private runtime repo；
- runtime / asset branch 或 backend endpoint；
- ops/auth mailbox path；
- 本地安装目录；
- `gh` 路径；
- Lark CLI 路径；
- polling interval 和 payload limit；
- startup/autostart 行为。

迁移时必须保留原实现的安全控制：command allowlist、禁止 administrative operation、显式 write intent、当前消息 write authorization、mutation replay protection、隔离的 binary temp storage，以及经过验证的 OAuth scope 检查。

真实 runtime repo/backend 必须保持 Private。这个 Public 目录只应包含示例，绝不能保存 live mailbox state。
