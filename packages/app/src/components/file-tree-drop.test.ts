import { describe, expect, test } from "bun:test"
import { isDescendant, isProbablyText, uniqueName, walkEntries } from "./file-tree-drop"

describe("uniqueName", () => {
  test("returns desired when no clash", () => {
    expect(uniqueName("foo.png", new Set())).toBe("foo.png")
    expect(uniqueName("foo.png", new Set(["bar.png"]))).toBe("foo.png")
  })

  test("appends ' (N)' before extension on clash", () => {
    expect(uniqueName("img.png", new Set(["img.png"]))).toBe("img (1).png")
    expect(uniqueName("img.png", new Set(["img.png", "img (1).png"]))).toBe("img (2).png")
    expect(uniqueName("img.png", new Set(["img.png", "img (1).png", "img (2).png"]))).toBe("img (3).png")
  })

  test("works for extensionless names", () => {
    expect(uniqueName("folder", new Set(["folder"]))).toBe("folder (1)")
    expect(uniqueName("folder", new Set(["folder", "folder (1)"]))).toBe("folder (2)")
  })

  test("treats hidden dotfiles as no-extension", () => {
    expect(uniqueName(".env", new Set([".env"]))).toBe(".env (1)")
  })

  test("preserves multi-dot extensions on the last segment only", () => {
    expect(uniqueName("archive.tar.gz", new Set(["archive.tar.gz"]))).toBe("archive.tar (1).gz")
  })
})

describe("isDescendant", () => {
  test("root parent contains every non-empty path", () => {
    expect(isDescendant("", "src")).toBe(true)
    expect(isDescendant("", "src/foo")).toBe(true)
    expect(isDescendant("", "")).toBe(false)
  })

  test("equal paths count as descendant", () => {
    expect(isDescendant("src", "src")).toBe(true)
  })

  test("nested paths are descendants", () => {
    expect(isDescendant("src", "src/foo")).toBe(true)
    expect(isDescendant("src", "src/foo/bar")).toBe(true)
  })

  test("siblings and prefix-collisions are not descendants", () => {
    expect(isDescendant("src", "srcs")).toBe(false)
    expect(isDescendant("src", "lib")).toBe(false)
    expect(isDescendant("src/foo", "src")).toBe(false)
  })

  test("trailing/leading slashes do not affect result", () => {
    expect(isDescendant("/src/", "/src/foo/")).toBe(true)
  })
})

describe("isProbablyText", () => {
  test("uses MIME type when present", () => {
    expect(isProbablyText(new File([""], "x", { type: "text/plain" }))).toBe(true)
    expect(isProbablyText(new File([""], "x.json", { type: "application/json" }))).toBe(true)
    expect(isProbablyText(new File([""], "x.png", { type: "image/png" }))).toBe(false)
  })

  test("falls back to extension when MIME is empty", () => {
    expect(isProbablyText(new File([""], "x.md"))).toBe(true)
    expect(isProbablyText(new File([""], "x.tsx"))).toBe(true)
    expect(isProbablyText(new File([""], "x.png"))).toBe(false)
    expect(isProbablyText(new File([""], "blob"))).toBe(false)
  })
})

type EntryLike = {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath: string
  _file?: File
  _kids?: EntryLike[]
  file?: (cb: (f: File) => void) => void
  createReader?: () => { readEntries: (cb: (entries: EntryLike[]) => void) => void }
}

function makeFile(name: string, content = "x"): EntryLike {
  const f = new File([content], name, { type: "text/plain" })
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: name,
    _file: f,
    file(cb) {
      cb(f)
    },
  }
}

function makeDir(name: string, kids: EntryLike[]): EntryLike {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: name,
    _kids: kids,
    createReader() {
      let pending = [...kids]
      return {
        readEntries(cb) {
          if (pending.length === 0) return cb([])
          const out = pending.slice(0, 100)
          pending = pending.slice(100)
          cb(out)
        },
      }
    },
  }
}

function items(entries: EntryLike[]): ArrayLike<{
  kind: string
  webkitGetAsEntry: () => EntryLike
}> {
  return entries.map((e) => ({ kind: "file", webkitGetAsEntry: () => e }))
}

describe("walkEntries", () => {
  test("yields a single file at top level", async () => {
    const out: { relPath: string; name: string }[] = []
    for await (const r of walkEntries(items([makeFile("a.txt")]))) {
      out.push({ relPath: r.relPath, name: r.file.name })
    }
    expect(out).toEqual([{ relPath: "a.txt", name: "a.txt" }])
  })

  test("recurses into nested directories with prefixed paths", async () => {
    const tree = makeDir("docs", [
      makeFile("readme.md"),
      makeDir("imgs", [makeFile("a.png"), makeFile("b.png")]),
    ])
    const out: string[] = []
    for await (const r of walkEntries(items([tree]))) out.push(r.relPath)
    expect(out.sort()).toEqual(["docs/imgs/a.png", "docs/imgs/b.png", "docs/readme.md"])
  })

  test("ignores items whose kind is not 'file'", async () => {
    const out: string[] = []
    const list: ArrayLike<{ kind: string; webkitGetAsEntry?: () => EntryLike }> = [
      { kind: "string" },
      { kind: "file", webkitGetAsEntry: () => makeFile("ok.txt") },
    ]
    for await (const r of walkEntries(list)) out.push(r.relPath)
    expect(out).toEqual(["ok.txt"])
  })

  test("falls back to getAsFile when no entry is available", async () => {
    const f = new File(["x"], "loose.txt")
    const list: ArrayLike<{ kind: string; webkitGetAsEntry: () => null; getAsFile: () => File }> = [
      { kind: "file", webkitGetAsEntry: () => null, getAsFile: () => f },
    ]
    const out: string[] = []
    for await (const r of walkEntries(list)) out.push(r.relPath)
    expect(out).toEqual(["loose.txt"])
  })
})
