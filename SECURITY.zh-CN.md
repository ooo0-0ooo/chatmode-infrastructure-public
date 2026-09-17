# 安全与公开边界

**[English](SECURITY.md) | 中文**

这个公开源码快照必须始终与私有运行时状态隔离。

## 绝对不要提交到 Public source repo 的内容

- API key、access token、refresh token、OAuth device code、cookie、session data 或其他凭据；
- 生产环境的 mailbox request/response 文件；
- 二进制 asset chunk 或重建后的私有 artifact；
- 包含个人数据或业务数据的截图、trace、log 或测试 fixture；
- private repo URL、private document URL、内部 ID 或项目特定 secret；
- 会暴露私有环境细节的真实本机路径；
- 未经过单独公开审查、直接从私有环境复制出来的 verified production baseline。

## 推荐部署模型

使用两个仓库或等价的两个信任区：

1. **Public source repo** — 可移植代码、示例、文档、模板。
2. **Private runtime repo / backend** — 真实 mailbox、runtime branch、artifact、secret、OAuth 状态和执行证据。

Public source repo 绝不能承担私有用户数据的实时 request/response 传输。

## GitHub Actions

默认 workflow 应遵循最小权限原则，通常使用 `contents: read`。只有范围非常明确、且无法被不受信任的 fork PR 诱导去修改 protected/private state 的 job，才应该获得写权限。

## 每次公开发布前

同时检查当前文件树和 Git 历史。把敏感文件从最新 commit 删除，并不会让它从旧 commit 中消失。如果 secret 曾经被提交过，应先轮换 secret，并重写/清理相关历史后再公开。
