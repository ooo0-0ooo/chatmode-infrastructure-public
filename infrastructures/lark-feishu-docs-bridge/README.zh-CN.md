# Lark / Feishu 文档 Bridge — Public Source

**[English](README.md) | 中文**

这个目录描述了一个用于受控操作 Lark/Feishu 文档的 Chat-mode Bridge，在“可移植/可公开”层面的边界。

私有实现可以通过 GitHub mailbox + 本地 watcher 调用已认证的 Lark 工具。Public 快照有意排除了已验证的 production watcher、真实 runtime branch、request/response 状态、OAuth 状态、binary asset 和项目特定 provenance。

## 使用指南

从这个 Public source 到你自己普通 ChatGPT Chat 中真正可工作的 Bridge，包括 private runtime repo、本地依赖、Lark App/OAuth、mailbox contract、watcher/supervisor、binary transport、Chat 第一跳指令和 smoke test，完整步骤见：

- [English](USAGE_GUIDE.md)
- [中文](USAGE_GUIDE.zh-CN.md)

## 可以公开分享的内容

- 通用架构和迁移说明；
- 参数化环境变量示例；
- 安全 gates 与权限模型；
- 可移植安装/迁移说明。

## 刻意保持私有的内容

- 如果仍然包含环境绑定默认值的 production `verified/` runtime code；
- 真实 `ops-request`、`ops-response`、`auth-request` 或 `auth-response` 状态；
- binary asset chunks 和重建文件；
- OAuth/session 材料；
- 真实 document ID、用户数据、截图、日志和 QA 证据。

## Runtime 隔离

实际 Bridge 必须部署到 Private runtime repo/backend。不要把生产 Bridge 的实时 mailbox 指向这个 Public source repo。

通用配置层见 `portable/`。
