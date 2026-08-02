import fs from "node:fs/promises"
import path from "node:path"
import {
  emptyWhiteboard,
  insertMermaidToFile,
  isPendingMermaidElement,
  parseWhiteboard,
  serializeWhiteboard,
} from "@opencode-ai/whiteboard/browser"
import { test, expect } from "../fixtures"
import { createSdk, sessionPath } from "../utils"
import { waitSession } from "../actions"

const BOARD_PATH = "e2e-mermaid.whiteboard"
const MERMAID_SOURCE = "flowchart TD\n  Start --> Stop"

function seedPendingMermaidBoard(): string {
  return insertMermaidToFile(serializeWhiteboard(emptyWhiteboard()), {
    mermaid: MERMAID_SOURCE,
    x: 80,
    y: 100,
    label: "E2E flow",
  })
}

function boardHasExpandedDiagram(raw: string): boolean {
  const doc = parseWhiteboard(raw)
  if (doc.elements.some((el) => isPendingMermaidElement(el))) return false
  return doc.elements.length >= 2
}

test("whiteboard expands pending mermaid on load and persists shapes", async ({ page, withProject }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (err) => pageErrors.push(err.message))

  await withProject(async ({ directory }) => {
    const sdk = createSdk(directory)
    await fs.writeFile(path.join(directory, BOARD_PATH), seedPendingMermaidBoard(), "utf8")

    const session = await sdk.session.create({ title: "whiteboard mermaid e2e" })
    const sessionID = session.data?.id
    if (!sessionID) throw new Error("missing session id")

    await page.goto(`${sessionPath(directory, sessionID)}?view=projection&lens=whiteboards`)
    await waitSession(page, { directory, sessionID })

    await expect(page.getByRole("navigation", { name: "Whiteboards" })).toBeVisible()
    await expect(page.getByRole("button", { name: "e2e-mermaid" })).toBeVisible({ timeout: 30_000 })

    await expect(page.locator(".excalidraw-host")).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(".excalidraw-host .excalidraw")).toBeVisible()

    await expect
      .poll(
        async () => {
          const raw = await fs.readFile(path.join(directory, BOARD_PATH), "utf8").catch(() => "")
          return boardHasExpandedDiagram(raw)
        },
        { timeout: 45_000, intervals: [500, 1000] },
      )
      .toBe(true)

    const saved = parseWhiteboard(await fs.readFile(path.join(directory, BOARD_PATH), "utf8"))
    expect(saved.elements.length).toBeGreaterThanOrEqual(2)
    expect(saved.elements.some((el) => isPendingMermaidElement(el))).toBe(false)

    expect(pageErrors.filter((msg) => /mermaid|excalidraw/i.test(msg))).toEqual([])
  })
})
