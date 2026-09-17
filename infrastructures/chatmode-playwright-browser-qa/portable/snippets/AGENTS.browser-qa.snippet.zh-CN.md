## Chat 模式 Browser QA 启动规则

**[English](AGENTS.browser-qa.snippet.md) | 中文**

对于任何需要浏览器/UI 验证的新一轮前端开发或修复：

1. 在修改产品代码前，先恢复仓库真实的 Git / GitHub / deployment 状态；
2. 如果已经存在未冻结的开发轮次，并且当前需求属于同一轮，则继续该分支；
3. 否则从仓库配置的 rolling development base 创建新一轮，而不是从 `main` 创建，也不要直接从已冻结的 acceptance tag/branch 开发；
4. 要求 candidate branch 继承 Chat-mode Playwright browser QA workflow、runner、manifest/adapter contract 和 branch-policy 文件；
5. 创建或更新 Pull Request，让 GitHub Actions 生成 Chat 可以读取的 browser QA run；
6. 把 build、runtime、browser regression、Figma fidelity、responsive、accessibility 和 product-behavior 证据视为彼此独立的 gates；
7. 每次有实质性前端修改后，都读取 Actions 的 run/job/log/artifact 证据，并继续在同一分支修复，直到当前轮次要求的 gates 全部满足；
8. 绝不能为了让 QA 通过而移动、重写或 retarget 已冻结的 acceptance ref；
9. 一轮正式冻结后，只能通过 fast-forward 把 rolling development base 推进到该轮预期的最终 commit，让下一轮同时继承最新产品状态和永久 QA 基础设施。

一旦这套规则安装进目标仓库，用户不应该还需要在每一轮重复记忆或重新说明这套分支/QA 流程。
