import { test, expect } from "../fixtures"
import { modKey } from "../utils"

function filename(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path
}

async function openFile(page: import("@playwright/test").Page, query = "package.json") {
  const item = page.getByRole("button", { name: filename(query) }).first()
  await expect(item).toBeVisible({ timeout: 30_000 })
  await item.click()

  const tab = page.getByRole("tab", { name: filename(query) }).first()
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
  return tab
}

test("mod+w closes the active file tab", async ({ page, gotoSession }) => {
  await gotoSession()

  await openFile(page)

  await page.keyboard.press(`${modKey}+W`)
  await expect(page.getByRole("tab", { name: "package.json" })).toHaveCount(0)
})

test("ctrl+x closes the active file tab", async ({ page, gotoSession }) => {
  await gotoSession()

  await openFile(page)

  await page.keyboard.press("Control+X")
  await expect(page.getByRole("tab", { name: "package.json" })).toHaveCount(0)
})

test("alt+left and alt+right switch file tabs", async ({ page, gotoSession }) => {
  await gotoSession()

  const first = await openFile(page, "package.json")
  const second = await openFile(page, "bunfig.toml")

  await expect(second).toHaveAttribute("aria-selected", "true")

  await page.keyboard.press("Alt+ArrowLeft")
  await expect(first).toHaveAttribute("aria-selected", "true")

  await page.keyboard.press("Alt+ArrowRight")
  await expect(second).toHaveAttribute("aria-selected", "true")
})
