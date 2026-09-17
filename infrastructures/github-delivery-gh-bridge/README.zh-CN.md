# GitHub Delivery Bridge

**[English](README.md) | 中文**

这是一组可复用的脚本和模板，用 GitHub CLI 完成仓库交付收尾：preflight 检查、身份认证验证、Pre-release 发布以及相关 Release 操作。

这个公开快照不包含项目特定的 release 证据、private repo provenance、用于验证的真实 tag/release，以及绑定具体环境的状态记录。

## 使用指南

从本机 Git/`gh` 登录，到 frozen commit、annotated tag、PR、Pre-release、read-back verification，以及“人工 Chat 模式”和“集成受控 runner”之间的边界，完整步骤见：

- [English](USAGE_GUIDE.md)
- [中文](USAGE_GUIDE.zh-CN.md)

## 包含内容

- `scripts/` — 可移植 PowerShell helper；
- `templates/` — 可复用交付模板。

使用前，应根据目标仓库的 branch protection、release process、权限和 CI policy 审查这些脚本。凭据必须保留在用户自己的 GitHub 认证环境或 secret store 中，绝不能提交进仓库。
