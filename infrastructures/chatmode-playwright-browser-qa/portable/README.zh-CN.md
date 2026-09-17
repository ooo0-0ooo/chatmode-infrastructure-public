# Portable · Chat 模式 Playwright Browser QA

**[English](README.md) | 中文**

这是一套可复用的 GitHub Actions + Playwright 工具包，用于给普通 Chat 工作流提供确定性的浏览器 QA 闭环。

## 包含的结构

```text
.github/workflows/
  chatmode-browser-qa.yml
qa/chatmode-browser-qa/
  run-visual-qa.mjs
  visual-references.example.json
  project-adapter.example.mjs
.chatmode/
  development-branch-policy.example.json
scripts/
  create-development-branch.mjs
  verify-development-branch-policy.mjs
  advance-development-base.mjs
snippets/
  AGENTS.browser-qa.snippet.md
  package-scripts.example.json
```

## 接入概要

1. 把这些文件复制到目标项目中，不要替换项目里无关的既有 QA。
2. 把 `visual-references.example.json` 复制为 `visual-references.json`，并定义需要测试的 cases。
3. 把 `project-adapter.example.mjs` 复制为 `project-adapter.mjs`，实现目标项目的状态准备逻辑。
4. 基于示例配置 `.chatmode/development-branch-policy.json`。
5. 合并 package-script snippet，而不是覆盖现有 `package.json`。
6. 添加 workflow，并把 `CHATMODE_QA_BASELINE_REF` 设置为不可变、已验收的 reference。
7. 至少真实跑通一次 fail → evidence → fix → pass，之后才能把接入视为已验证。

## Runtime 证据

Runner 可以收集 console error、page exception、HTTP failure、failed request、确定性截图、browser-baseline 比较，以及可选的 reference-image 比较。

## 安全

真实凭据和私有测试账号状态必须留在仓库之外。优先使用 mock、fixture、sandbox 或专用的低权限测试账号。CI workflow 应遵循最小权限原则，并且不应让不受信任的 fork PR 获得修改私有状态的权限。
