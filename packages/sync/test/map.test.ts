import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { loadMap, saveMap, mapPath } from "../src/map"

test("saveMap/loadMap round-trips per adapter", () => {
  const dir = mkdtempSync(join(tmpdir(), "sync-map-"))
  try {
    saveMap("github", { "TRL-1": { id: "5", url: "https://example.com/5" } }, dir)
    expect(loadMap("github", dir)["TRL-1"].url).toBe("https://example.com/5")
    expect(loadMap("linear", dir)).toEqual({})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("project namespaces the map file so repos don't collide", () => {
  const dir = mkdtempSync(join(tmpdir(), "sync-map-"))
  try {
    saveMap("github", { "TRL-1": { id: "1", url: "https://a/1" } }, dir, "proj-a")
    saveMap("github", { "TRL-1": { id: "7", url: "https://b/7" } }, dir, "proj-b")
    expect(mapPath("github", "proj-a", dir)).not.toBe(mapPath("github", "proj-b", dir))
    expect(loadMap("github", dir, "proj-a")["TRL-1"].url).toBe("https://a/1")
    expect(loadMap("github", dir, "proj-b")["TRL-1"].url).toBe("https://b/7")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
