import { test, expect } from "../fixtures"
import { waitTerminalReady } from "../actions"
import { railTerminalToggleSelector, terminalPanelSelector, terminalSelector } from "../selectors"
import { terminalToggleKey } from "../utils"

test("icon rail terminal toggle opens and closes panel", async ({ page, gotoSession }) => {
  await gotoSession()

  const panel = page.locator(terminalPanelSelector)
  const terminal = page.locator(terminalSelector)
  const toggle = page.locator(railTerminalToggleSelector).first()

  if (!(await panel.isVisible())) {
    await page.keyboard.press(terminalToggleKey)
    await waitTerminalReady(page, { term: terminal })
  }

  await expect(panel).toBeVisible()

  await toggle.click()
  await expect(panel).toHaveCount(0)

  await toggle.click()
  await expect(panel).toBeVisible()
  await waitTerminalReady(page, { term: terminal })
})
