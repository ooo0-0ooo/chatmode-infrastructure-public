# Chat 模式 Playwright Browser QA

**[English](README.md) | 中文**

这个公开工具包只包含可移植的 browser-QA 实现。项目特定 provenance、验收证据、截图和已验证的私有 baseline 均被有意排除。

## 使用指南

从 `portable/` 接入到你自己的 Web 项目，并形成可工作的 ChatGPT + GitHub Actions + Playwright 验证闭环，完整步骤见：

- [English](USAGE_GUIDE.md)
- [中文](USAGE_GUIDE.zh-CN.md)

把 `portable/` 作为目标项目的接入源。迁移完成后，必须在目标项目中重新跑完整的黑盒 QA 闭环，才能把该适配版本视为已验证。
