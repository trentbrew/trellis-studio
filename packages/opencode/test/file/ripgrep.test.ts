import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { symlink } from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Ripgrep } from "../../src/file/ripgrep"
import { File } from "../../src/file"
import { Instance } from "../../src/project/instance"

describe("file.ripgrep", () => {
  test("defaults to include hidden", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "visible.txt"), "hello")
        await fs.mkdir(path.join(dir, ".opencode"), { recursive: true })
        await Bun.write(path.join(dir, ".opencode", "thing.json"), "{}")
      },
    })

    const files = await Array.fromAsync(Ripgrep.files({ cwd: tmp.path }))
    const hasVisible = files.includes("visible.txt")
    const hasHidden = files.includes(path.join(".opencode", "thing.json"))
    expect(hasVisible).toBe(true)
    expect(hasHidden).toBe(true)
  })

  test("hidden false excludes hidden", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "visible.txt"), "hello")
        await fs.mkdir(path.join(dir, ".opencode"), { recursive: true })
        await Bun.write(path.join(dir, ".opencode", "thing.json"), "{}")
      },
    })

    const files = await Array.fromAsync(Ripgrep.files({ cwd: tmp.path, hidden: false }))
    const hasVisible = files.includes("visible.txt")
    const hasHidden = files.includes(path.join(".opencode", "thing.json"))
    expect(hasVisible).toBe(true)
    expect(hasHidden).toBe(false)
  })

  test("search returns empty when nothing matches", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "match.ts"), "const value = 'other'\n")
      },
    })

    const hits = await Ripgrep.search({
      cwd: tmp.path,
      pattern: "needle",
    })

    expect(hits).toEqual([])
  })

  test("follow indexes files inside symlinked directories", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (root) => {
        const real = path.join(root, "real")
        await fs.mkdir(path.join(real, "packages", "app"), { recursive: true })
        await Bun.write(path.join(real, "packages", "app", "main.ts"), "export {}\n")
        await fs.writeFile(path.join(root, ".gitignore"), "real\n", "utf-8")
        await fs.writeFile(path.join(root, ".ignore"), "!real/\n!real/**\n", "utf-8")
        await symlink(real, path.join(root, "link"), process.platform === "win32" ? "junction" : "dir")
      },
    })

    const without = await Array.fromAsync(Ripgrep.files({ cwd: tmp.path, follow: false }))
    const withFollow = await Array.fromAsync(Ripgrep.files({ cwd: tmp.path, follow: true }))

    expect(without.some((f) => f.includes("main.ts"))).toBe(false)
    expect(withFollow.some((f) => f.replaceAll("\\", "/").includes("link/packages/app/main.ts"))).toBe(true)
  })

  test("skips .trellis directory contents", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "visible.ts"), "ok\n")
        await fs.mkdir(path.join(dir, ".trellis", "store"), { recursive: true })
        await Bun.write(path.join(dir, ".trellis", "store", "entity.json"), "{}\n")
      },
    })

    const files = await Array.fromAsync(Ripgrep.files({ cwd: tmp.path }))
    expect(files.includes("visible.ts")).toBe(true)
    expect(files.some((f) => f.includes(".trellis"))).toBe(false)
  })

  test("File.search does not follow symlinks for non-git desk roots", async () => {
    await using tmp = await tmpdir({
      init: async (root) => {
        await Bun.write(path.join(root, "README.md"), "# desk\n")
        const real = path.join(path.dirname(root), `bigrepo-${Math.random().toString(36).slice(2)}`)
        await fs.mkdir(path.join(real, "src"), { recursive: true })
        await Bun.write(path.join(real, "src", "deep.ts"), "export {}\n")
        await symlink(real, path.join(root, "studio"), process.platform === "win32" ? "junction" : "dir")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await File.init()
        const hits = await File.search({ query: "deep", type: "file" })
        expect(hits.some((f) => f.includes("deep.ts"))).toBe(false)
        const all = await File.search({ query: "", type: "file" })
        expect(all).toContain("README.md")
      },
    })
  })

  test("File.search finds files in symlinked repos when follow is enabled", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (root) => {
        const real = path.join(root, "realrepo")
        await fs.mkdir(path.join(real, "src"), { recursive: true })
        await Bun.write(path.join(real, "src", "widget.ts"), "export {}\n")
        await fs.writeFile(path.join(root, ".gitignore"), "studio\n", "utf-8")
        await fs.writeFile(path.join(root, ".ignore"), "!studio/\n!studio/**\n", "utf-8")
        await symlink(real, path.join(root, "studio"), process.platform === "win32" ? "junction" : "dir")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await File.init()
        const result = await File.search({ query: "widget", type: "file" })
        expect(result.some((f) => f.replaceAll("\\", "/").includes("studio/src/widget.ts"))).toBe(true)
      },
    })
  })
})
