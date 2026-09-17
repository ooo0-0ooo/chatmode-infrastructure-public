# RELEASE_TAG

**[English](release-notes.md) | 中文**

> 冻结交付版本对应的 GitHub Pre-release 来源记录。

- 日期：YYYY-MM-DD
- 状态：`Pre-release / Not Accepted / Not Final`
- Tag：`RELEASE_TAG`
- 冻结源码 commit：`FULL_COMMIT_SHA`
- Source branch：`SOURCE_BRANCH`
- Pull Request：`PR_URL`
- 精确 Deployment ID：`DEPLOYMENT_ID`
- 精确 Deployment：`DEPLOYMENT_URL`
- Acceptance 入口：`ACCEPTANCE_URL`
- Handoff：`HANDOFF_URL`
- Acceptance：`ACCEPTANCE_DOC_URL`
- QA 证据：`QA_URL`
- 上一版本：`PREVIOUS_TAG`
- 下一版本：none

## 范围

只描述本轮明确要求的修改。历史冻结版本不重写。

## 主要变化

- Change 1
- Change 2
- Change 3

## 验证结果

已验证证据：

- 已检查 frozen commit；
- annotated tag 可以解析到 frozen commit；
- 已检查 PR metadata；
- 已检查精确 deployment/build 结果；
- Release 从一个已存在且已经核验的 tag 发布。

除非实际完成验证，否则不得声称以下项目 PASS：

- 已部署 click-flow matrix；
- 严格像素比较；
- 已部署 console/network/accessibility sweep；
- 独立 lint/calculation 结果。

## 保留原则

- 不要 retarget 或修改之前已经冻结的 tag / Release。
- 冻结后的 governance metadata 可以在不可变 tag target 之后继续更新。
- 不能仅根据“已经发布”推断用户 acceptance 状态。
