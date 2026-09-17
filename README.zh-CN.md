# ChatGPT Chat 模式基础设施

**[English](README.md) | 中文**

这是一组可复用的基础设施方案，用于为普通 ChatGPT Chat 工作流补充受控的外部执行与验证能力。

这个公开源码快照只包含可移植实现、示例、模板和通用架构说明。私有运行时状态、生产 mailbox、二进制传输数据、已验证的生产基线、项目特定 provenance 和真实 QA 证据均被有意排除。

## 包含的基础设施

### 1. Lark / Feishu 文档 Bridge

用于把 Chat 工作流通过受控的本地执行 Bridge 连接到 Lark/Feishu 的参考架构。公开快照只包含可移植的迁移/配置层；生产 watcher、真实 mailbox 状态、OAuth 状态和已验证的生产基线不会公开。

- [English usage guide](infrastructures/lark-feishu-docs-bridge/USAGE_GUIDE.md)
- [中文使用指南](infrastructures/lark-feishu-docs-bridge/USAGE_GUIDE.zh-CN.md)

### 2. Chat 模式 Playwright Browser QA

一套可移植的 GitHub Actions + Playwright 浏览器 QA 工具包：构建候选版本、启动浏览器、进入确定性状态、捕获 runtime 错误和截图、比较浏览器基线，并通过 CI Artifact 返回证据。

- [English usage guide](infrastructures/chatmode-playwright-browser-qa/USAGE_GUIDE.md)
- [中文使用指南](infrastructures/chatmode-playwright-browser-qa/USAGE_GUIDE.zh-CN.md)

### 3. GitHub Delivery Bridge

用于 release preflight、GitHub CLI 验证、Pre-release 发布和项目交付工作流的通用脚本与模板。

- [English usage guide](infrastructures/github-delivery-gh-bridge/USAGE_GUIDE.md)
- [中文使用指南](infrastructures/github-delivery-gh-bridge/USAGE_GUIDE.zh-CN.md)

## 安全边界

这个仓库被设计成可以安全公开源码，但**不要把这个 Public repo 本身当作生产运行时 mailbox 或二进制 carrier**。凭据、OAuth 材料、request/response payload、包含私有数据的截图、测试账号数据和生产执行状态，都应放在独立的 Private runtime repo 或其他私有后端中。

在把任何一套基础设施用于生产前，请阅读 [`SECURITY.zh-CN.md`](SECURITY.zh-CN.md)。

## 版权与授权

本仓库**没有提供任何开源 License**。公开只代表源码可以被查看，不代表授予第三方复制、修改、再分发、商用或将源码并入其他产品的许可。任何额外使用权限必须由版权所有者另行明确授权。
