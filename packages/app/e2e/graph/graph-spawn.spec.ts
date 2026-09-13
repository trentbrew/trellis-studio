import { test, expect } from "../fixtures"
import { createSdk, sessionPath } from "../utils"
import { waitSession } from "../actions"

test("graph surface is visible without inset loading veil and defaults to 2d", async ({ page, withProject }) => {
  await withProject(async ({ directory }) => {
    const sdk = createSdk(directory)
    const session = await sdk.session.create({ title: "graph spawn" })
    const sessionID = session.data?.id
    if (!sessionID) throw new Error("missing session id")

    const path = `${sessionPath(directory, sessionID)}?view=graph`
    await page.goto(path)
    await waitSession(page, { directory, sessionID })

    const surface = page.locator('[data-component="graph-surface"]')
    await expect(surface).toBeVisible()
    await expect(surface.locator("svg")).toBeVisible()
    await expect(page.locator(".absolute.inset-0").filter({ hasText: "Loading graph" })).toHaveCount(0)

    const two = page.getByRole("button", { name: "2D" })
    if (await two.count()) {
      await expect(two).toHaveAttribute("aria-pressed", "true")
    }
  })
})
