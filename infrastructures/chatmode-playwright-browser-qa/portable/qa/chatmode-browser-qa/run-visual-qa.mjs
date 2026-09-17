import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"

const repositoryRoot = process.cwd()
const manifestPath = path.resolve(
  repositoryRoot,
  process.env.CHATMODE_QA_MANIFEST || "qa/chatmode-browser-qa/visual-references.json",
)
const adapterPath = path.resolve(
  repositoryRoot,
  process.env.CHATMODE_QA_ADAPTER || "qa/chatmode-browser-qa/project-adapter.mjs",
)
const mode = process.env.CHATMODE_QA_MODE || "audit"
const origin = (process.env.CHATMODE_QA_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "")
const outputRoot = path.resolve(
  repositoryRoot,
  process.env.CHATMODE_QA_OUTPUT_DIR || "qa/chatmode-browser-qa/output",
)
const actualDirectory = path.join(outputRoot, "actual")
const browserDiffDirectory = path.join(outputRoot, "diff-browser")
const figmaDiffDirectory = path.join(outputRoot, "diff-figma")
const browserBaselineDirectory = process.env.CHATMODE_QA_BROWSER_BASELINE_DIR
  ? path.resolve(repositoryRoot, process.env.CHATMODE_QA_BROWSER_BASELINE_DIR)
  : null

const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const adapter = await import(pathToFileURL(adapterPath).href)

if (typeof adapter.prepareCase !== "function") {
  throw new Error(`Adapter must export prepareCase(): ${path.relative(repositoryRoot, adapterPath)}`)
}
if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
  throw new Error("Manifest must contain at least one case")
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(actualDirectory, { recursive: true })
await mkdir(browserDiffDirectory, { recursive: true })
await mkdir(figmaDiffDirectory, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: {
    width: manifest.viewport?.width ?? 1440,
    height: manifest.viewport?.height ?? 1000,
  },
  deviceScaleFactor: manifest.viewport?.deviceScaleFactor ?? 1,
  reducedMotion: "reduce",
  colorScheme: manifest.viewport?.colorScheme ?? "light",
})

if (manifest.fixtureTime) {
  await context.addInitScript(({ timestamp }) => {
    const NativeDate = Date
    class FixtureDate extends NativeDate {
      constructor(...args) {
        super(...(args.length === 0 ? [timestamp] : args))
      }
      static now() {
        return new NativeDate(timestamp).getTime()
      }
    }
    Object.defineProperty(window, "Date", { configurable: true, value: FixtureDate })
  }, { timestamp: manifest.fixtureTime })
}

const ignoredPatterns = manifest.ignoreRuntimeUrlPatterns || []
function ignoreRuntimeUrl(url) {
  return ignoredPatterns.some((pattern) => url.includes(pattern))
}

const runtime = {
  consoleErrors: [],
  pageErrors: [],
  failedResponses: [],
  failedRequests: [],
}

function attachRuntimeListeners(page, caseId) {
  page.on("console", (message) => {
    const url = message.location().url || ""
    if (message.type() === "error" && !ignoreRuntimeUrl(url)) {
      runtime.consoleErrors.push({ caseId, text: message.text(), url: url || null })
    }
  })
  page.on("pageerror", (error) => runtime.pageErrors.push({ caseId, message: error.message }))
  page.on("response", (response) => {
    if (response.status() >= 400 && !ignoreRuntimeUrl(response.url())) {
      runtime.failedResponses.push({ caseId, status: response.status(), url: response.url() })
    }
  })
  page.on("requestfailed", (request) => {
    if (!ignoreRuntimeUrl(request.url())) {
      runtime.failedRequests.push({
        caseId,
        error: request.failure()?.errorText || "unknown",
        url: request.url(),
      })
    }
  })
}

async function waitReady(page, caseDefinition) {
  await page.waitForLoadState("domcontentloaded")
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.waitForTimeout(caseDefinition.waitAfterStateMs ?? 200)
}

function normalizeClip(box, padding = 0) {
  return {
    x: Math.max(0, box.x - padding),
    y: Math.max(0, box.y - padding),
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  }
}

async function captureCase(page, caseDefinition, outputPath) {
  const capture = caseDefinition.capture || { mode: "page", fullPage: false }

  if (capture.mode === "selector") {
    if (!capture.selector) throw new Error(`${caseDefinition.id}: selector capture requires capture.selector`)
    const locator = page.locator(capture.selector).first()
    await locator.waitFor({ state: "visible" })
    const box = await locator.boundingBox()
    if (!box) throw new Error(`${caseDefinition.id}: unable to locate screenshot selector ${capture.selector}`)
    await page.screenshot({
      path: outputPath,
      clip: normalizeClip(box, capture.padding ?? 0),
      animations: "disabled",
    })
    return
  }

  if (capture.mode === "clip") {
    for (const key of ["x", "y", "width", "height"]) {
      if (typeof capture[key] !== "number") throw new Error(`${caseDefinition.id}: clip capture requires numeric ${key}`)
    }
    await page.screenshot({
      path: outputPath,
      clip: { x: capture.x, y: capture.y, width: capture.width, height: capture.height },
      animations: "disabled",
    })
    return
  }

  if (capture.mode !== "page") throw new Error(`${caseDefinition.id}: unsupported capture mode ${capture.mode}`)
  await page.screenshot({
    path: outputPath,
    fullPage: capture.fullPage ?? true,
    animations: "disabled",
  })
}

async function fileExists(filePath) {
  try {
    const value = await stat(filePath)
    return value.isFile()
  } catch {
    return false
  }
}

async function exactCompare({ id, referencePath, referenceLabel, actualPath, diffPath }) {
  if (!(await fileExists(referencePath))) {
    return {
      id,
      status: "MISSING_REFERENCE",
      reference: referenceLabel,
      actual: path.relative(repositoryRoot, actualPath),
      differentPixels: null,
      totalPixels: null,
      differenceRatio: null,
      diff: null,
    }
  }

  const reference = PNG.sync.read(await readFile(referencePath))
  const actual = PNG.sync.read(await readFile(actualPath))
  if (reference.width !== actual.width || reference.height !== actual.height) {
    return {
      id,
      status: "SIZE_MISMATCH",
      reference: referenceLabel,
      actual: path.relative(repositoryRoot, actualPath),
      referenceSize: [reference.width, reference.height],
      actualSize: [actual.width, actual.height],
      differentPixels: null,
      totalPixels: reference.width * reference.height,
      differenceRatio: null,
      diff: null,
    }
  }

  let differentPixels = 0
  for (let index = 0; index < reference.data.length; index += 4) {
    if (
      reference.data[index] !== actual.data[index] ||
      reference.data[index + 1] !== actual.data[index + 1] ||
      reference.data[index + 2] !== actual.data[index + 2] ||
      reference.data[index + 3] !== actual.data[index + 3]
    ) differentPixels += 1
  }

  const diff = new PNG({ width: reference.width, height: reference.height })
  pixelmatch(reference.data, actual.data, diff.data, reference.width, reference.height, {
    threshold: 0,
    includeAA: true,
  })
  await writeFile(diffPath, PNG.sync.write(diff))
  const totalPixels = reference.width * reference.height

  return {
    id,
    status: differentPixels === 0 ? "PASS" : "DIFF",
    reference: referenceLabel,
    actual: path.relative(repositoryRoot, actualPath),
    referenceSize: [reference.width, reference.height],
    actualSize: [actual.width, actual.height],
    differentPixels,
    totalPixels,
    differenceRatio: differentPixels / totalPixels,
    diff: path.relative(repositoryRoot, diffPath),
  }
}

const captures = []
for (const caseDefinition of manifest.cases) {
  const page = await context.newPage()
  page.setDefaultTimeout(caseDefinition.timeoutMs ?? 15_000)
  attachRuntimeListeners(page, caseDefinition.id)

  try {
    await adapter.prepareCase({
      page,
      context,
      origin,
      caseDefinition,
      manifest,
    })
    await waitReady(page, caseDefinition)
    if (typeof adapter.beforeCapture === "function") {
      await adapter.beforeCapture({ page, context, origin, caseDefinition, manifest })
      await waitReady(page, caseDefinition)
    }
    const actualPath = path.join(actualDirectory, `${caseDefinition.id}.png`)
    await captureCase(page, caseDefinition, actualPath)
    captures.push({ caseDefinition, actualPath })
  } finally {
    await page.close()
  }
}

const environment = {
  node: process.version,
  chromium: browser.version(),
  viewport: manifest.viewport,
}
await browser.close()

const runtimeIssueCount = Object.values(runtime).reduce((sum, items) => sum + items.length, 0)

if (mode === "capture") {
  const summary = {
    generatedAt: new Date().toISOString(),
    mode,
    origin,
    fixtureTime: manifest.fixtureTime || null,
    environment,
    captures: captures.map(({ caseDefinition, actualPath }) => ({
      id: caseDefinition.id,
      actual: path.relative(repositoryRoot, actualPath),
    })),
    runtime: { issueCount: runtimeIssueCount, ...runtime },
    verdict: runtimeIssueCount === 0 ? "PASS" : "FAIL",
  }

  await writeFile(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")
  const markdown = [
    "# Chat-mode Browser Baseline Capture",
    "",
    `- Verdict: **${summary.verdict}**`,
    `- Origin: \`${origin}\``,
    `- Captures: **${captures.length}**`,
    `- Runtime issues: **${runtimeIssueCount}**`,
    "",
  ].join("\n")
  await writeFile(path.join(outputRoot, "summary.md"), markdown, "utf8")
  console.log(markdown)
  if (summary.verdict !== "PASS") process.exitCode = 1
} else {
  const browserResults = []
  const figmaResults = []

  for (const { caseDefinition, actualPath } of captures) {
    if (browserBaselineDirectory) {
      const baselinePath = path.join(browserBaselineDirectory, `${caseDefinition.id}.png`)
      browserResults.push(await exactCompare({
        id: caseDefinition.id,
        referencePath: baselinePath,
        referenceLabel: path.relative(repositoryRoot, baselinePath),
        actualPath,
        diffPath: path.join(browserDiffDirectory, `${caseDefinition.id}-diff.png`),
      }))
    }

    if (caseDefinition.reference) {
      const referencePath = path.resolve(repositoryRoot, caseDefinition.reference)
      figmaResults.push(await exactCompare({
        id: caseDefinition.id,
        referencePath,
        referenceLabel: caseDefinition.reference,
        actualPath,
        diffPath: path.join(figmaDiffDirectory, `${caseDefinition.id}-diff.png`),
      }))
    }
  }

  const browserFailCount = browserResults.filter((result) => result.status !== "PASS").length
  const browserPassCount = browserResults.length - browserFailCount
  const figmaExactCount = figmaResults.filter((result) => result.status === "PASS").length
  const figmaDiffCount = figmaResults.length - figmaExactCount
  const verdict = browserFailCount === 0 && runtimeIssueCount === 0 ? "PASS" : "FAIL"

  const summary = {
    generatedAt: new Date().toISOString(),
    mode,
    origin,
    fixtureTime: manifest.fixtureTime || null,
    environment,
    regressionGate: {
      enabled: Boolean(browserBaselineDirectory),
      baselineDirectory: browserBaselineDirectory ? path.relative(repositoryRoot, browserBaselineDirectory) : null,
      passCount: browserPassCount,
      failCount: browserFailCount,
      results: browserResults,
    },
    figmaExactAudit: {
      note: "Exact cross-renderer evidence. Differences remain visible and are not hidden by a relaxed tolerance.",
      exactCount: figmaExactCount,
      diffCount: figmaDiffCount,
      results: figmaResults,
    },
    runtime: { issueCount: runtimeIssueCount, ...runtime },
    verdict,
  }

  await writeFile(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")

  const markdown = [
    "# Chat-mode Playwright Browser QA Result",
    "",
    `- Verdict: **${verdict}**`,
    `- Origin: \`${origin}\``,
    `- Fixture time: \`${manifest.fixtureTime || "none"}\``,
    `- Chromium: \`${environment.chromium}\``,
    `- Browser regression gate: **${browserPassCount} PASS / ${browserFailCount} FAIL**`,
    `- Exact design audit: **${figmaExactCount} exact / ${figmaDiffCount} with differences**`,
    `- Runtime issues: **${runtimeIssueCount}**`,
    "",
    "## Browser regression gate (blocking when baseline supplied)",
    "",
    "| Case | Result | Different pixels | Ratio |",
    "| --- | --- | ---: | ---: |",
    ...(browserResults.length
      ? browserResults.map((result) => `| ${result.id} | ${result.status} | ${result.differentPixels ?? "n/a"} | ${result.differenceRatio == null ? "n/a" : result.differenceRatio.toFixed(8)} |`)
      : ["| n/a | baseline not supplied | n/a | n/a |"]),
    "",
    "## Exact design/Figma audit (evidence)",
    "",
    "| Case | Result | Different pixels | Ratio |",
    "| --- | --- | ---: | ---: |",
    ...(figmaResults.length
      ? figmaResults.map((result) => `| ${result.id} | ${result.status} | ${result.differentPixels ?? "n/a"} | ${result.differenceRatio == null ? "n/a" : result.differenceRatio.toFixed(8)} |`)
      : ["| n/a | no design references configured | n/a | n/a |"]),
    "",
    "## Runtime evidence",
    "",
    `- console.error: ${runtime.consoleErrors.length}`,
    `- page exceptions: ${runtime.pageErrors.length}`,
    `- failed responses: ${runtime.failedResponses.length}`,
    `- failed requests: ${runtime.failedRequests.length}`,
    "",
  ].join("\n")

  await writeFile(path.join(outputRoot, "summary.md"), markdown, "utf8")
  console.log(markdown)
  if (verdict !== "PASS") process.exitCode = 1
}
