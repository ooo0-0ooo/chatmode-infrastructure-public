# GitHub Delivery Bridge — Chat 模式使用指南

**[English](USAGE_GUIDE.md) | 中文**

> **权利声明：** 本仓库没有开源 License。本指南用于说明获得授权的使用者如何运行该基础设施，不构成对源码复制、修改、再分发或商用的授权。

## 这套工具是什么

这套工具提供可复用的 Git + GitHub CLI (`gh`) helper，用于软件交付最后阶段：

```text
working branch
  -> frozen commit
  -> annotated tag
  -> Pull Request metadata
  -> Pre-release / Release
  -> read-back verification
```

Public package 包含：

```text
scripts/
  verify-gh.ps1
  release-preflight.ps1
  publish-prerelease.ps1

templates/
  release-notes.md
```

这些脚本在安装了 Git、PowerShell 和 GitHub CLI 的机器上可以直接执行。

但 Chat 模式有一个重要边界：

**Public package 本身不会让普通 ChatGPT Chat 获得任意本机 shell 权限。**

如果 Chat 只有 GitHub connector，它可以读取和修改 connector 暴露的 GitHub 对象，但不能自动执行你电脑上的 `git` / `gh` 命令，除非你额外提供一个受控执行通道，例如已授权的 local runner 或 typed Remote MCP/tool。

因此有两种有效工作模式：

1. **人工本地执行：** Chat 负责规划和核验交付，你在本机运行脚本/命令。
2. **集成 Chat 执行：** 只把有限的 delivery operations 通过受控 runner/tool 暴露给 Chat，并且只在明确授权后调用。

第二种模式最接近“普通 Chat 可以端到端完成 GitHub delivery”。

---

## 1. 前置条件

需要：

- 目标 GitHub repo 的本地 clone；
- Git；
- GitHub CLI `gh`；
- Windows PowerShell（用于现有 `.ps1` helper）；
- 对目标 repo 有足够权限的 GitHub account；
- 通过 `gh` 或其他安全 credential mechanism 配置 HTTPS Git authentication；
- 如果希望 Chat 读取 PR、commit、release 和 repo 状态，则 ChatGPT 需要连接目标 GitHub repo。

如果要做到全自动 Chat 模式，还需要一个**受控 execution bridge**，能够在本机或可信 backend 运行批准的 Git/`gh` 操作。

---

## 2. 安装 GitHub CLI

Windows：

```powershell
winget install --id GitHub.cli --source winget
```

关闭旧终端并重新打开，然后：

```powershell
gh --version
```

认证：

```powershell
gh auth login
```

常见选择：

```text
GitHub.com
HTTPS
Authenticate Git with your GitHub credentials? Yes
Login with a web browser
```

随后验证：

```powershell
gh auth status
```

不要把 GitHub token、browser device code、credential-helper 明文或个人凭据放进本仓库。

---

## 3. 验证目标 Repo 权限

PowerShell：

```powershell
gh repo view OWNER/REPO
```

再运行只读 helper：

```powershell
./scripts/verify-gh.ps1 -Repo OWNER/REPO
```

它检查：

```text
gh installed
+ GitHub authentication valid
+ target repository accessible
```

这一步失败时，应先修认证或 repo permission，再进行任何 release 操作。

---

## 4. 把 Helper 放到执行位置

有两种方式。

### 方案 A — 复制进目标项目

例如：

```text
TARGET_REPO/
  delivery-tools/
    verify-gh.ps1
    release-preflight.ps1
    publish-prerelease.ps1
    release-notes.md
```

这样 release procedure 会跟项目一起 versioned。

### 方案 B — Toolkit 独立保存

Toolkit 单独保存，但执行时 terminal 的 current working directory 必须是目标项目的本地 Git clone。

脚本中的 Git 命令默认作用于当前 repo，因此 mutation 前一定要再次确认 working directory。

---

## 5. 先确定交付边界

一次交付必须围绕一个确定、不可变的 commit。

目标模型：

```text
mutable development branch
  -> exact frozen commit SHA
  -> annotated tag points to that commit
  -> GitHub Release references the existing tag
  -> later governance/documentation commits may continue without changing the frozen source
```

不要只用含糊、可变化的 `HEAD` 作为最终 release 记录。

记录要冻结的完整 SHA，例如：

```powershell
git show --no-patch --oneline <FULL_COMMIT_SHA>
```

---

## 6. 先做只读 Preflight

在创建 tag/release 前：

```powershell
./scripts/release-preflight.ps1 `
  -Repo OWNER/REPO `
  -Tag YOUR_TAG `
  -Commit FULL_COMMIT_SHA
```

这个 helper 故意不做 mutation。它检查：

- GitHub authentication；
- target repo access；
- local working-tree state；
- fetch 最新 refs/tags；
- frozen commit 是否可解析；
- tag 是否已在本地存在；
- tag 是否已在远端存在。

同时人工确认：

```powershell
git status --short --branch
git fetch --all --tags
```

如果当前 repo 不对、登录账号不对、或 frozen commit 不是你准备交付的 commit，立即停止。

---

## 7. 创建 Annotated Tag

Public package 有意把 annotated-tag 创建交给 native Git，因为 Git 才是本地 commit/ref object 的权威工具。

先确认 tag 不存在：

```powershell
git tag --list YOUR_TAG
git ls-remote --tags origin "refs/tags/YOUR_TAG*"
```

然后针对**明确 frozen SHA**创建 annotated tag：

```powershell
git tag -a YOUR_TAG FULL_COMMIT_SHA -m "YOUR_TAG"
```

核验 peeled commit：

```powershell
git rev-parse "YOUR_TAG^{}"
git show --no-patch --decorate YOUR_TAG
```

`rev-parse` 输出必须等于目标 frozen commit SHA。

只 push 目标 tag：

```powershell
git push origin refs/tags/YOUR_TAG
```

远端核验：

```powershell
git ls-remote --tags origin "refs/tags/YOUR_TAG*"
```

Annotated tag 通常会出现 tag-object 行和 `^{}` peeled commit 行；peeled commit 仍必须等于 frozen SHA。

绝不要为了让新 build 看起来像已验收版本而移动旧 frozen tag。

---

## 8. 创建或更新 Pull Request

如果不存在 delivery PR：

```powershell
gh pr create `
  --repo OWNER/REPO `
  --base BASE_BRANCH `
  --head HEAD_BRANCH `
  --title "PR title" `
  --body-file PR_BODY.md
```

已有 PR：

```powershell
gh pr edit PR_NUMBER `
  --repo OWNER/REPO `
  --title "Updated title" `
  --body-file PR_BODY.md
```

回读：

```powershell
gh pr view PR_NUMBER --repo OWNER/REPO
```

PR 是否 merge 是独立的项目治理决定。不能因为建立 Release record 就自动 merge。

---

## 9. 准备 Release Notes

复制：

```text
templates/release-notes.md
```

到项目专用文件，例如：

```text
RELEASE_NOTES.md
```

替换全部 placeholder。

建议记录：

- date；
- release state（`Pre-release` / `Not Accepted` / `Final` 等）；
- tag；
- frozen commit SHA；
- source branch；
- Pull Request；
- 必要时的精确 deployment/build reference；
- acceptance/handoff/QA evidence；
- previous version；
- 本轮 scope；
- 实际完成的 verification。

没有真实证据的 gate 不得声称 PASS。

GitHub Release body 是治理 metadata，不能用来悄悄重新定义 tag 指向哪个 commit。

---

## 10. 先 Preview Pre-release Mutation

`publish-prerelease.ps1` 使用 PowerShell `SupportsShouldProcess`，可以先通过 `-WhatIf` 查看计划操作：

```powershell
./scripts/publish-prerelease.ps1 `
  -Repo OWNER/REPO `
  -Tag YOUR_TAG `
  -NotesFile ./RELEASE_NOTES.md `
  -Title "YOUR_TAG" `
  -WhatIf
```

脚本同时检查：

- notes file 存在；
- GitHub auth 有效；
- target repo 可访问；
- remote tag 已存在；
- 对应 Release 尚不存在。

它会拒绝静默覆盖已有 Release。

---

## 11. 发布 Pre-release

确认 preflight 和 `-WhatIf` 正确后：

```powershell
./scripts/publish-prerelease.ps1 `
  -Repo OWNER/REPO `
  -Tag YOUR_TAG `
  -NotesFile ./RELEASE_NOTES.md `
  -Title "YOUR_TAG"
```

内部等价于：

```text
gh release create <TAG>
  --repo <OWNER/REPO>
  --verify-tag
  --prerelease
  --title <TITLE>
  --notes-file <FILE>
```

`--verify-tag` 很重要：Release 应消费一个已经存在并核验过的 tag，而不是让 `gh release create` 在错误 commit 上隐式造 tag。

脚本随后执行 `gh release view` 做 read-back。

---

## 12. 发布后核验

必须回读：

```powershell
gh release view YOUR_TAG --repo OWNER/REPO
```

至少检查：

```text
tag
release title
pre-release/final state
notes
published time
assets, if any
```

再核验 tag：

```powershell
git ls-remote --tags origin "refs/tags/YOUR_TAG*"
```

如果只有 Release notes 需要修正，可以在用户明确要求下改 metadata，而不要移动 tag：

```powershell
gh release edit YOUR_TAG `
  --repo OWNER/REPO `
  --notes-file ./RELEASE_NOTES.md
```

---

## 13. 普通 ChatGPT Chat：人工执行模式

即使 Chat 有 GitHub access、但没有本地命令执行工具，这个模式也可以使用。

先让 ChatGPT 连接目标 GitHub repo。

可用如下请求开始：

```text
Use the connected GitHub repository OWNER/REPO to restore the current delivery state. Identify the intended frozen commit, existing PR, existing tags/releases, and any delivery evidence. Do not move or delete existing frozen tags/releases. Prepare the exact local Git/gh commands needed to create a new annotated tag and GitHub Pre-release for the frozen commit, using the repository's delivery process. Separate read-only preflight from mutation and stop before any destructive operation that I have not explicitly requested.
```

Chat 可以：

- 检查 GitHub connector 暴露的 repo 状态；
- 帮助确定准确 frozen commit；
- 起草 PR/Release notes；
- 给出精确 helper invocation；
- 你本机执行后重新读取 GitHub 状态核验。

这个模式安全且实用，但不是完全 hands-free。

---

## 14. 让 Chat 直接执行 Delivery

要去掉人工 terminal 步骤，需要给 Chat 暴露一个**受控 execution bridge**。

不要仅仅为了运行这些脚本就开放 unrestricted arbitrary shell。

更合适的是 typed tools：

```text
delivery.verify_environment
delivery.preflight
delivery.create_annotated_tag
delivery.push_tag
delivery.create_or_update_pr
delivery.publish_prerelease
delivery.edit_release_notes
delivery.verify_delivery
```

每个 tool 接收明确 structured args，例如：

```text
repo
working_directory
commit_sha
tag
base_branch
head_branch
pr_number
notes_file
release_title
```

Runner 内部可以调用 native Git 和 `gh`，但 Chat 不能直接发送任意 shell string。

### 写操作授权规则

只读 actions 可以运行。

所有 create/edit/push/publish/delete/merge mutation，都必须与用户**当前消息中的明确授权**匹配。

“GitHub 已登录”绝不等于持续写权限。

### 推荐执行顺序

```text
verify_environment
  -> preflight
  -> explicit user authorization
  -> create annotated tag
  -> verify local peeled tag
  -> push tag
  -> verify remote peeled tag
  -> create/update PR as requested
  -> publish Pre-release with --verify-tag
  -> read-back verification
```

任何 verification 失败都应停止，而不是乐观继续。

---

## 15. 集成 Runner 后的 Chat Prompt

当 Chat 同时拥有 GitHub access 和受控 delivery runner 时，可以这样开始新 Chat：

```text
For repository OWNER/REPO, use the connected GitHub data plus the approved delivery tools to complete the requested project freeze. Start with read-only preflight. Use the exact frozen commit SHA; never use an ambiguous moving HEAD as the final release target. Never retarget, delete, or overwrite an existing frozen tag or Release. Any mutation must match an explicit request in my current message. After each mutation, read the state back and verify tag -> commit, PR, Release status, and notes before reporting completion.

<DESCRIBE THE DELIVERY TASK HERE>
```

---

## 16. Public Scripts 做什么 / 不做什么

### `verify-gh.ps1`

只读，验证：

```text
GitHub CLI installed
GitHub authentication valid
target repository accessible
```

### `release-preflight.ps1`

只读，验证：

```text
GitHub authentication
repository access
working-tree state
remote refs/tags fetched
frozen commit exists
tag conflicts locally/remotely
```

### `publish-prerelease.ps1`

会 mutation：

```text
checks notes file
checks auth/repo
requires remote tag to exist
refuses existing Release overwrite
publishes Pre-release with --verify-tag
reads the Release back
```

它**不会**替你创建 annotated tag。

它**不会**自行决定该 Release 是 Final 还是 Pre-release。

它**不会** merge PR。

它**不会**管理 Vercel/v0/其他平台的 deployment。

---

## 17. 安全与治理规则

即使以后构建更自动的 runner，也应保留：

- 默认不 force push；
- 未获得单独明确 destructive request 时，绝不移动/删除已有 frozen tag；
- 不静默 retarget 历史 Release；
- 不因为 Release 已发布就自动 merge PR；
- freeze 操作使用精确 repo 名和完整 commit SHA；
- 从 tag 发布时使用 `--verify-tag`；
- mutation 后执行 read-back；
- GitHub credential 留在 `gh` / OS credential store，不放 repo；
- reusable template 不提交个人邮箱、access token、device code、本机绝对路径；
- branch protection、organization ruleset、SSO、required review 仍是权威治理规则。

如果组织策略阻止某个操作，不要为了让 automation PASS 而削弱策略。

---

## 18. 故障排查

### `gh auth status` 失败

运行：

```powershell
gh auth login
```

确认登录的是正确 GitHub account/host。

### `gh repo view OWNER/REPO` 失败

检查 repo 名、账号权限、organization SSO、private repo access、GitHub host。

### Preflight 提示 tag 已存在

停止并检查已有 tag。不要因为想复用同一个名字就移动它。应该按项目治理决定使用旧版本还是创建新版本/tag。

### `publish-prerelease.ps1` 提示 remote tag 不存在

先创建、核验并 push annotated tag。脚本故意禁止让 `gh release create` 帮你隐式发明 tag。

### Release 已存在

先检查：

```powershell
gh release view YOUR_TAG --repo OWNER/REPO
```

如果只是 metadata 需要修改，并且用户当前明确要求，可用 `gh release edit`。不要创建重复 Release 或 retarget tag。

### Chat 能检查 GitHub，但不能运行脚本

如果 Chat 只有 GitHub connector，这是预期行为。使用人工执行模式，或按前文提供受控 local/remote execution tool。

### Local tag 正确，但 remote verification 不一致

停止。在进行任何 Release 操作前，重新确认 exact object/peeled commit。

---

## 19. 什么情况下算完成配置

### 人工模式 Ready

```text
Git + gh installed
+ target repo authenticated
+ helper scripts run locally
+ Chat can inspect target GitHub repo
+ frozen commit/tag/release procedure is documented
+ release read-back verification works
```

### 集成 Chat 模式 Ready

```text
all manual-mode requirements
+ Chat has a bounded execution tool for approved Git/gh operations
+ the tool does not expose arbitrary shell by default
+ mutations require current-message authorization
+ a real preflight -> tag -> push -> release -> read-back cycle succeeds
```

达到这一步后，Chat 才能参与完整 GitHub delivery 闭环，而不需要用户为了最后的 Tag/Release 步骤再手动打开 GitHub 网页。
