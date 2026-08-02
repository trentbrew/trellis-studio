import { describe, expect, test } from "bun:test"
import { invalidateVaultCache, loadVaultCached, peekVaultCache } from "./vault-cache"
import type { NoteRecord } from "./types"

const sampleNotes = (): NoteRecord[] => [
  {
    file: {
      name: "a.md",
      basename: "a",
      path: "a.md",
      folder: "",
      ext: "md",
      size: 1,
      ctime: 0,
      mtime: 0,
      tags: [],
      links: [],
    },
    properties: {},
  },
]

describe("loadVaultCached", () => {
  test("dedupes concurrent loads for the same directory", async () => {
    invalidateVaultCache()
    let loads = 0
    const load = async () => {
      loads += 1
      return sampleNotes()
    }

    const [a, b] = await Promise.all([loadVaultCached("dir-a", load), loadVaultCached("dir-a", load)])
    expect(loads).toBe(1)
    expect(a).toEqual(b)
    expect(peekVaultCache("dir-a")).toEqual(a)
  })

  test("invalidates cached notes for a directory", async () => {
    invalidateVaultCache()
    let loads = 0
    const load = async () => {
      loads += 1
      return sampleNotes()
    }

    await loadVaultCached("dir-a", load)
    invalidateVaultCache("dir-a")
    await loadVaultCached("dir-a", load)
    expect(loads).toBe(2)
  })
})
