import { test, expect } from "../fixtures"
import { createSdk, sessionPath, serverUrl } from "../utils"
import { waitSession } from "../actions"

const seedBookmark = async (directory: string, id: string, title: string) => {
  const url = new URL(`${serverUrl}/trellis/store/assert`)
  url.searchParams.set("directory", directory)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facts: [
        { e: id, a: "type", v: "Bookmark" },
        { e: id, a: "cms_status", v: "published" },
        { e: id, a: "title", v: title },
      ],
    }),
  })
  expect(res.ok).toBe(true)
}

test("cms entry drawer opens from cmsEntry query param", async ({ page, withProject }) => {
  await withProject(async ({ directory, gotoSession }) => {
    const id = "bookmark:e2enav01"
    await seedBookmark(directory, id, "E2E Nav Bookmark")

    const sdk = createSdk(directory)
    const session = await sdk.session.create({ title: "cms entry nav" })
    const sessionID = session.data?.id
    if (!sessionID) throw new Error("missing session id")

    const path = `${sessionPath(directory, sessionID)}?view=cms&cmsEntry=${encodeURIComponent(id)}`
    await page.goto(path)
    await waitSession(page, { directory, sessionID })

    await expect(page.locator(".route-detail")).toBeVisible()
    await expect(page.getByText(id)).toBeVisible()
  })
})

test("cmsEntry persists in URL when entry drawer is open", async ({ page, withProject }) => {
  await withProject(async ({ directory }) => {
    const id = "bookmark:e2enav02"
    await seedBookmark(directory, id, "Agent Link Bookmark")

    const sdk = createSdk(directory)
    const session = await sdk.session.create({ title: "entity link nav" })
    const sessionID = session.data?.id
    if (!sessionID) throw new Error("missing session id")

    const path = `${sessionPath(directory, sessionID)}?view=cms&cmsEntry=${encodeURIComponent(id)}`
    await page.goto(path)
    await waitSession(page, { directory, sessionID })

    await expect(page).toHaveURL(/view=cms/)
    await expect(page).toHaveURL(/cmsEntry=/)
    await expect(page.locator(".route-detail")).toBeVisible()
    await expect(page.getByText(id)).toBeVisible()
  })
})
