import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { inferPublishBuild } from "../../src/publish/build-plan"

describe("inferPublishBuild", () => {
  test("static HTML project skips build", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "publish-plan-"))
    await writeFile(path.join(root, "index.html"), "<html>hi</html>")
    const plan = await inferPublishBuild(root)
    expect(plan.buildCommand).toBeNull()
    expect(plan.outputDir).toBe(".")
    expect(plan.spaFallback).toBe(false)
  })

  test("vite project uses npm run build and dist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "publish-plan-"))
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: { build: "vite build", dev: "vite" },
        devDependencies: { vite: "^6.0.0" },
      }),
    )
    await writeFile(path.join(root, "vite.config.ts"), "export default { build: { outDir: 'dist' } }")
    const plan = await inferPublishBuild(root)
    expect(plan.buildCommand).toBe("npm run build")
    expect(plan.outputDir).toBe("dist")
    expect(plan.spaFallback).toBe(true)
  })
})
