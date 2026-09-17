# Chat 模式 Playwright Browser QA — 使用指南

**[English](USAGE_GUIDE.md) | 中文**

> **权利声明：** 本仓库没有开源 License。本指南用于说明获得授权的使用者如何接入和运行该基础设施，不构成对源码复制、修改、再分发或商用的授权。

## 这套工具是什么

这是一套用于**现有 Web 应用**的可移植 browser-QA 接入工具包。

它不是一个独立 App。使用者需要把 `portable/` 下的文件复制到希望由 ChatGPT 修改和验证的 Web 项目中。

接入后，目标闭环是：

```text
用户要求 ChatGPT 修改产品
        |
        v
Chat 恢复 GitHub branch / PR / Actions 状态
        |
        v
Chat 在当前开发分支修改代码
        |
        v
Draft PR 触发 GitHub Actions
        |
        v
Playwright build + serve + 进入确定性状态
        |
        +--> runtime errors
        +--> screenshots
        +--> browser-regression comparison
        +--> optional design/reference exact comparison
        |
        v
Workflow artifact
        |
        v
Chat 读取证据并继续修复同一个分支
```

在本仓库三套基础设施中，这一套目前最接近直接复用：核心 workflow、runner、branch-policy scripts、examples 和 Chat/agent snippet 已经公开。

---

## 1. 前置条件

你需要一个可以在 CI 中 build + serve 的现有 Web 应用仓库。

当前提供的 workflow 默认假设：

- 使用 GitHub repository；
- GitHub Actions 已启用；
- ChatGPT 已连接目标 GitHub repo；
- CI 使用 Node.js 22；
- pnpm 作为参考 package manager；
- 项目存在 `build` script；
- 项目存在遵守 `PORT` 的 production `start` script；
- 至少有一个不可变、已验收的 tag/commit/ref 可作为 browser regression baseline；
- 项目能够以确定性的方式进入需要验证的 UI 状态。

Runner 使用：

- Playwright Chromium；
- `pixelmatch`；
- `pngjs`。

如果你的项目使用 npm、yarn、Bun、其他 Node 版本或不同 server contract，需要相应修改 workflow，并重新跑完整黑盒验收。

---

## 2. 把 portable kit 复制进目标项目

从本仓库：

```text
infrastructures/chatmode-playwright-browser-qa/portable/
```

把其中内容复制到**目标 Web 项目根目录**，最终应包含：

```text
.github/workflows/chatmode-browser-qa.yml
.chatmode/development-branch-policy.example.json
qa/chatmode-browser-qa/
  run-visual-qa.mjs
  visual-references.example.json
  project-adapter.example.mjs
scripts/
  create-development-branch.mjs
  verify-development-branch-policy.mjs
  advance-development-base.mjs
snippets/
  AGENTS.browser-qa.snippet.md
  package-scripts.example.json
```

不要删除或替换项目中无关的既有测试基础设施。第一次接入应 side-by-side 安装。

---

## 3. 创建项目自己的真实配置文件

Public package 故意提供 example，而不是假装已经知道你的应用结构。

创建：

```text
.chatmode/development-branch-policy.json
qa/chatmode-browser-qa/visual-references.json
qa/chatmode-browser-qa/project-adapter.mjs
```

分别从对应 `.example` 文件复制开始。

---

## 4. 配置 development branch policy

复制：

```text
.chatmode/development-branch-policy.example.json
```

为：

```text
.chatmode/development-branch-policy.json
```

然后按你的仓库修改。

### `rollingDevelopmentBase`

代表“最新正式验收产品状态 + 永久 QA 基础设施”的滚动开发基线分支。

示例：

```json
{
  "rollingDevelopmentBase": "infra/chatmode-browser-qa"
}
```

新的开发轮次应从这里开始，而不是从过期 acceptance branch，也不要默认从 `main` 开始。

### `initialProductBaseline`

第一次建立 rolling base 时所基于的不可变 accepted ref。

示例：

```json
{
  "initialProductBaseline": "acceptance-r1"
}
```

请换成项目自己的真实 tag/ref。

### `frozenAcceptanceBranchPattern`

用于防止已验收/已冻结分支重新被当作活动开发分支。

示例：

```json
{
  "frozenAcceptanceBranchPattern": "^acceptance-r\\d+(?:-[a-z0-9-]+)?$"
}
```

如果项目使用不同命名规则，请修改。

### `requiredInheritedPaths`

列出每个 candidate branch 必须继承的文件。应保留 QA workflow、runner、adapter、manifest 和 branch-policy scripts。

Policy scripts 会验证 candidate 是否真的继承自 rolling development base，并且仍然包含必需的基础设施文件。

---

## 5. 合并必要的 package scripts

不要覆盖项目已有的 `package.json`。

从：

```text
snippets/package-scripts.example.json
```

合并需要的 scripts。最小基础设施 scripts：

```json
{
  "scripts": {
    "branch:new": "node scripts/create-development-branch.mjs",
    "branch:verify": "node scripts/verify-development-branch-policy.mjs",
    "branch:advance-base": "node scripts/advance-development-base.mjs",
    "qa:browser": "node qa/chatmode-browser-qa/run-visual-qa.mjs"
  }
}
```

应用本身还必须提供和 workflow 兼容的 production build/start 命令，例如：

```json
{
  "scripts": {
    "build": "<your production build command>",
    "start": "<your production server command; must honor PORT>"
  }
}
```

如果项目已经有 `typecheck`、`lint`、`verify:calculations`、unit tests 等 gates，应继续保留。Workflow 会在合适的位置先跑静态/项目级 gates，再进入浏览器验收。

---

## 6. 安装或核对 Browser-QA 依赖

Workflow 会自行安装固定版本的 browser-QA runtime；本地执行时可以安装同一组依赖：

```bash
pnpm add -D playwright@1.55.0 pixelmatch@7.1.0 pngjs@7.0.0
pnpm exec playwright install chromium
```

Linux CI 中使用：

```bash
pnpm exec playwright install --with-deps chromium
```

如果主动修改这些版本，应视为 renderer/runtime 变化，并重新建立相关 baseline。

---

## 7. 实现 `project-adapter.mjs`

复制：

```text
qa/chatmode-browser-qa/project-adapter.example.mjs
```

为：

```text
qa/chatmode-browser-qa/project-adapter.mjs
```

这是最关键的项目特定文件。

它的职责是在截图前，把真实应用放入一个**确定性的目标状态**。

典型职责包括：

- 选择语言/locale；
- 进入已知测试登录态；
- 设置确定性 fixture data；
- 打开特定 dialog/drawer；
- 导航到特定 route；
- 切换 role/account type；
- 等待已知异步状态稳定。

Example 中的 `qa.example.locale` 等 localStorage key 只是占位符，应替换为项目真正的 test/demo 机制。

适合的 adapter 方式包括：

- 项目自己拥有的 test/demo route；
- fixture API；
- mock-data mode；
- 应用能识别的确定性 browser storage；
- 专用低权限 test account；
- 基于 role、label 或 `data-*` selector 的稳定 UI 交互。

**不要**为了让截图“看起来匹配”而在 adapter 里篡改 DOM/CSS。Adapter 应进入真实状态，而不是伪造预期结果。

必须 export：

```js
export async function prepareCase({ page, context, origin, caseDefinition, manifest }) {
  // enter deterministic application state
}
```

可选 export：

```js
export async function beforeCapture({ page, context, origin, caseDefinition, manifest }) {
  // optional final stabilization step
}
```

---

## 8. 在 `visual-references.json` 定义 QA cases

复制：

```text
qa/chatmode-browser-qa/visual-references.example.json
```

为：

```text
qa/chatmode-browser-qa/visual-references.json
```

Manifest 包含全局 rendering 设置和一个或多个 cases。

示例：

```json
{
  "fixtureTime": "2026-01-15T12:00:00.000Z",
  "viewport": {
    "width": 1440,
    "height": 1000,
    "deviceScaleFactor": 1,
    "colorScheme": "light"
  },
  "ignoreRuntimeUrlPatterns": [
    "/favicon.ico",
    "/_vercel/"
  ],
  "cases": [
    {
      "id": "home-en",
      "path": "/home",
      "state": {
        "locale": "en",
        "auth": "test-user"
      },
      "capture": {
        "mode": "selector",
        "selector": "[data-qa-shell]",
        "padding": 0
      },
      "reference": "qa/references/home-en.png"
    }
  ]
}
```

### `fixtureTime`

冻结 browser context 中的 `Date.now()` / 默认 `new Date()` 行为。页面存在日期、年龄、倒计时或随时间变化的文案时应使用。

### `viewport`

固定 viewport 和 device scale，保证确定性渲染。

### `state`

由 adapter 消费的项目自定义输入。

### `capture`

支持：

```text
page      -> whole page / full-page screenshot
selector  -> first matching selector
clip      -> explicit x/y/width/height region
```

### `reference`

可选的精确设计/reference PNG。配置后，runner 会输出与该文件的精确 pixel-difference 证据。

视觉状态发生实质变化时，应使用独立 case，例如：

- desktop / mobile；
- English / Chinese；
- logged-in / logged-out；
- 不同 account role；
- dialog open / closed；
- success/error/empty/loading 状态。

---

## 9. 需要时加入 Design/Reference 图片

如需对设计导出图做 exact visual evidence，可把已审核 PNG 放在稳定路径，例如：

```text
qa/references/
```

然后让对应 case 指向目标图片。

Runner 区分两个概念：

### Browser regression baseline

Candidate Chromium 输出和一个不可变 accepted source ref 所生成的 Chromium 输出比较。

配置后，这通常是 blocking regression gate。

### Design / Figma exact audit

Candidate 还可以与 reference PNG 做精确比较。

这层作为显式证据保留，因为跨 renderer 可能存在差异。不要通过设置一个很大的 arbitrary tolerance 把差异隐藏掉，然后仍声称“exact”。

---

## 10. 配置不可变 Browser Baseline

在**目标项目 GitHub repo** 设置 repository variable：

```text
CHATMODE_QA_BASELINE_REF=<IMMUTABLE_ACCEPTED_TAG_OR_COMMIT>
```

例如：

```text
acceptance-r17
v1.4.0-accepted
4f43d8c0...
```

必须使用不可变 accepted ref。

不要因为方便就使用可变化的 `main`；否则今天的 candidate 可能悄悄重新定义明天的 baseline。

`workflow_dispatch` 也支持手动传入 `baseline_ref`。

---

## 11. 在真实应用上验证 Workflow

Workflow 大致执行：

```text
resolve baseline ref
  -> checkout candidate
  -> checkout immutable baseline into a second directory
  -> install dependencies
  -> verify branch policy
  -> run typecheck/lint/calculation gates when available
  -> build candidate
  -> build baseline
  -> start baseline server on port 3001
  -> capture baseline screenshots in Chromium
  -> start candidate server on port 3000
  -> run candidate browser QA
  -> compare screenshots
  -> collect runtime failures
  -> upload summary/screenshots/diffs as artifact
```

依赖它之前，必须验证目标应用：

- 能使用配置的 package manager 安装；
- 能在 GitHub-hosted Ubuntu build；
- 能无交互启动；
- 遵守 `PORT`；
- 能在 workflow 的等待时间内 HTTP-ready；
- 不依赖未保存的个人浏览器状态。

---

## 12. 创建第一个 Draft PR

使用真实开发分支，创建 Draft PR。

Workflow 在 `pull_request` 触发，这是推荐的正常工作模式，因为它给 Chat 提供稳定证据链：

```text
PR
  -> head commit
  -> Actions workflow run
  -> jobs / steps / logs
  -> artifact
  -> summary.json / screenshots / diff files
```

第一次运行失败并不是坏事；继续修复接入，直到 workflow 本身可信。

---

## 13. 必须做一次故意的 fail → fix → pass

不要因为“某一次刚好绿了”就宣布基础设施已经安装成功。

应至少：

1. 建立 1–2 个确定性 cases；
2. 得到 clean PASS；
3. 在 candidate branch 故意加入一个安全、明显的 UI 差异；
4. 确认 browser regression gate FAIL；
5. 确认 artifact 内有预期 screenshot/diff/summary；
6. revert/fix 这个差异；
7. 确认同一 case 再次 PASS。

这证明 QA loop 能抓真实 browser regression，而不是只会“成功执行脚本”。

---

## 14. 把 Workflow 接入 ChatGPT Chat 模式

给 ChatGPT 的 GitHub connection 授权访问**目标应用 repo**。

Chat 应能够查看：

- branches；
- commits；
- Pull Requests；
- workflow runs；
- job/step results；
- logs；
- artifacts。

如果项目有 `AGENTS.md` 或等价 AI instructions surface，把：

```text
snippets/AGENTS.browser-qa.snippet.md
```

中的 policy 加进去。

目标是用户不需要每次前端任务都重复说“跑 Playwright”。

新 Chat 的第一条消息可以使用：

```text
Use the connected GitHub repository OWNER/REPO. Before changing frontend code, restore the current development round, rolling development base, active PR, latest relevant Actions run, and immutable browser baseline. Continue an existing unfrozen round when appropriate; otherwise create the new round from the configured rolling development base. After each meaningful frontend change, use the repository's Chat-mode browser QA workflow and read the resulting runtime/visual evidence before deciding the change is complete.

<YOUR PRODUCT TASK>
```

当 repo-level instructions 在你的环境里已被稳定加载后，用户消息可以缩短为真实产品需求。

---

## 15. 正常 Chat 模式开发闭环

接入后，一轮典型流程应是：

```text
User: change the UI
  -> Chat restores repo/round state
  -> Chat continues or creates a development branch
  -> Chat modifies code
  -> Chat updates/creates Draft PR
  -> Actions runs automatically
  -> Chat reads runtime + visual evidence
  -> Chat fixes failures on the same branch
  -> repeat until required gates pass
  -> project formally freezes an acceptance ref
  -> rolling development base is fast-forwarded to that frozen final commit
```

如果已连接的 GitHub 工具能够暴露 workflow evidence，用户就不应该还需要手动下载 screenshot 或把 log 复制回 Chat。

---

## 16. 使用 `workflow_dispatch` 验证已部署 Demo

Workflow 支持手动输入：

```text
target_url    -> optional already-deployed URL
baseline_ref  -> optional immutable baseline override
```

如果 `target_url` 为空，workflow 会在 CI 中本地 build + serve candidate commit。

如果提供 `target_url`，该 URL 必须能被 GitHub Actions runner 访问。

如果部署受登录、Vercel Deployment Protection、VPN 等限制，应提供项目自己拥有的合法最小权限测试访问方式。不要把个人 browser profile 或个人 cookie 上传到 repo 里绕过保护。

---

## 17. Runner 已收集的 Runtime Gates

Runner 记录：

- browser `console.error`；
- uncaught page exception；
- HTTP status `>= 400` 的 response；
- failed network request。

`ignoreRuntimeUrlPatterns` 只能用于有明确理由、确定不是产品问题的噪音，例如无害 favicon 请求。

不要为了让 workflow 变绿而把真实产品故障放进 ignore list。

---

## 18. 安全模型

推荐默认值：

- workflow permission 使用 `contents: read`；
- 不把个人 browser cookie 提交到 Git；
- 优先使用 fixture、mock、sandbox 或专用低权限 test account；
- 不上传包含不必要个人/业务数据的 screenshot；
- 不让不受信任的 fork PR 获得 private state 写权限；
- secret 使用目标 repo 的 secret mechanism，绝不放在 manifest/adapter source；
- 注意 artifact retention，因为 screenshot/trace 可能包含 URL、姓名、邮箱或业务数据。

Portable workflow 是源码，不代表获得修改无关 repo 或 production service 的授权。

---

## 19. 故障排查

### Workflow 在 Playwright 启动前就失败

检查 package-manager 假设、依赖安装、build scripts、Node 版本和 branch-policy validation。

### Baseline checkout 失败

确认 `CHATMODE_QA_BASELINE_REF` 存在，并且 Actions 有权限读取。

### Candidate server 一直无法 ready

确认 `start` command 遵守 `PORT`、绑定可访问 interface，并且能从 CI 中 build 后的 production output 启动。

### 每次截图都变化

消除 nondeterminism：

- 用 `fixtureTime` 冻结时间；
- 使用 fixture data；
- 关闭随机性或提供确定性 seed；
- 等待 font/data 稳定；
- 避免使用不断变化的个人生产账号；
- 固定 viewport/device scale。

### Adapter 无法进入目标状态

创建项目自己拥有的 test/demo 机制，不要在页面加载后直接操纵 DOM 来伪造状态。

### Design exact audit 有差异，但 browser regression PASS

这是两层不同证据。Browser regression 问的是“已接受的 Chromium 输出有没有变化”；design exact audit 问的是“PNG 是否与 design/reference PNG 完全一致”。应分别调查，不要合并成一个结论。

### Chat 修改了代码，但没有读取 Actions 证据

加强 repo-level agent instructions，并在行为稳定前使用前面给出的显式 first-message workflow prompt。

---

## 20. 什么情况下可以认为接入完成

只有同时满足：

```text
candidate project can build in CI
+ deterministic states can be entered
+ screenshots are stable
+ browser regression detects intentional differences
+ runtime errors are surfaced
+ artifacts are readable from Chat
+ branch policy prevents development on frozen refs
+ Chat can complete at least one real fail -> evidence -> fix -> pass loop
```

这时它才真正按设计工作：不是一个独立 Playwright demo，而是嵌入目标产品 repo 的可复用浏览器验证层。
