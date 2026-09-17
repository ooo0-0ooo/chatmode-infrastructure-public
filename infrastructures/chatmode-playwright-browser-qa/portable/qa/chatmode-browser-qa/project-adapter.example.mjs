// Copy this file to project-adapter.mjs and replace the example state logic
// with deterministic project-specific QA behavior.

export async function prepareCase({ page, origin, caseDefinition }) {
  const initialPath = caseDefinition.path || "/"

  // Navigate to the project origin first so localStorage/sessionStorage belong to
  // the correct origin. Keep this step deterministic and test-only.
  await page.goto(`${origin}${initialPath}`, { waitUntil: "domcontentloaded" })
  await page.evaluate(() => document.fonts.ready.then(() => true))

  const state = caseDefinition.state || {}

  // Example only. Replace these keys with the project's own supported test/demo
  // harness. Do not mutate DOM/CSS to fake the expected screenshot.
  await page.evaluate((nextState) => {
    sessionStorage.clear()

    if (nextState.locale) {
      localStorage.setItem("qa.example.locale", nextState.locale)
    }

    if (nextState.auth) {
      localStorage.setItem("qa.example.auth", nextState.auth)
    }
  }, state)

  // If state was configured through browser storage, reload so the application
  // consumes it from startup. A real project may instead call a demo console,
  // mock API, test endpoint, or dedicated login helper.
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.evaluate(() => document.fonts.ready.then(() => true))

  // Example dialog path. Replace with stable role/label/data-* selectors.
  if (state.dialog === "example") {
    const button = page.getByRole("button", { name: /open example dialog/i })
    if (await button.count()) await button.click()
  }
}

export async function beforeCapture({ page }) {
  // Optional final stabilization hook.
  // Good uses: wait for deterministic data, close an intentional QA console,
  // wait for a known animation to finish.
  // Bad uses: rewrite product text/styles/geometry to match the reference image.
  await page.evaluate(() => document.fonts.ready.then(() => true))
}
