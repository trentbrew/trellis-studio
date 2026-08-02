import { test, expect } from "../fixtures"
import { createSdk, sessionPath, serverUrl } from "../utils"
import { waitSession } from "../actions"

async function assertFacts(directory: string, facts: { e: string; a: string; v: unknown }[]) {
  const url = new URL(`${serverUrl}/trellis/store/assert`)
  url.searchParams.set("directory", directory)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts }),
  })
  expect(res.ok).toBe(true)
}

async function seedBookmarkCollection(directory: string) {
  const props = JSON.stringify([
    { key: "name", type: "text", required: true, label: "Title" },
    { key: "url", type: "url", required: true, label: "URL" },
    { key: "description", type: "text", label: "Description" },
  ])
  await assertFacts(directory, [
    { e: "schema:bookmark", a: "type", v: "TypeSchema" },
    { e: "schema:bookmark", a: "label", v: "Bookmarks" },
    { e: "schema:bookmark", a: "cms", v: true },
    { e: "schema:bookmark", a: "props", v: props },
  ])
}

async function seedBookmark(
  directory: string,
  id: string,
  name: string,
  url: string,
  description?: string,
) {
  const facts: { e: string; a: string; v: unknown }[] = [
    { e: id, a: "type", v: "Bookmark" },
    { e: id, a: "cms_status", v: "published" },
    { e: id, a: "name", v: name },
    { e: id, a: "url", v: url },
  ]
  if (description) facts.push({ e: id, a: "description", v: description })
  await assertFacts(directory, facts)
}

test("cms grid view renders bookmarks without loading external page URLs as images", async ({ page, withProject }) => {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))

  await withProject(async ({ directory }) => {
    await seedBookmarkCollection(directory)
    await seedBookmark(
      directory,
      "bookmark:grid01",
      "A City is Not a Tree",
      "https://www.patternlanguage.com/bookstore/bookstore-app.html",
      "Christopher Alexander essay reference.",
    )
    await seedBookmark(
      directory,
      "bookmark:grid02",
      "The third hard problem",
      "https://example.com/third-hard-problem",
      "Short description for grid preview.",
    )

    const sdk = createSdk(directory)
    const session = await sdk.session.create({ title: "cms grid view" })
    const sessionID = session.data?.id
    if (!sessionID) throw new Error("missing session id")

    const path = `${sessionPath(directory, sessionID)}?view=cms`
    await page.goto(path)
    await waitSession(page, { directory, sessionID })

    await page.getByRole("button", { name: "Bookmarks" }).click()
    await page.getByRole("button", { name: "Grid", pressed: false }).click()

    await expect(page.getByRole("button", { name: "Grid", pressed: true })).toBeVisible()
    await expect(page.getByText("A City is Not a Tree")).toBeVisible()
    await expect(page.getByText("The third hard problem")).toBeVisible()
    await expect(page.getByText("patternlanguage.com", { exact: false })).toBeVisible()

    const imgs = page.locator('img[src*="patternlanguage.com"]')
    await expect(imgs).toHaveCount(0)

    expect(errors.filter((msg) => msg.includes("reading 'style'"))).toEqual([])
  })
})
