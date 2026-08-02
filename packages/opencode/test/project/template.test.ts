import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { ProjectTemplate } from "../../src/project/template"
import { tmpdir } from "../fixture/fixture"

describe("ProjectTemplate", () => {
  test("lists built-in project templates", async () => {
    const templates = await ProjectTemplate.list()
    const ids = templates.map((template) => template.id)
    expect(ids).toContain("app-solid")
    expect(ids).toContain("docs-astro")
    expect(ids).toContain("game-phaser")
    expect(ids).toContain("game-threlte")
    expect(ids).toContain("mobile-expo")
    expect(ids).toContain("video-remotion")
    expect(ids).toContain("web-vite")
  })

  test("materializes a project and replaces placeholders", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "launch-film")

    const result = await ProjectTemplate.create({
      id: "video-remotion",
      name: "Launch Film",
      target,
      initGit: false,
    })

    expect(result.path).toBe(target)
    expect(JSON.parse(await fs.readFile(path.join(target, "package.json"), "utf8"))).toMatchObject({
      name: "launch-film",
      scripts: {
        dev: "remotion studio --port 3000",
      },
    })
    expect(await fs.readFile(path.join(target, "src", "Scene.tsx"), "utf8")).toContain('const title = "Launch Film"')
    expect(JSON.parse(await fs.readFile(path.join(target, "config.json"), "utf8"))).toMatchObject({
      projections: {
        workspaceType: "video",
        pinned: ["notes", "scenes", "scripts", "media"],
      },
    })
  })

  test("materializes every built-in template", async () => {
    await using tmp = await tmpdir()
    const templates = await ProjectTemplate.list()

    for (const template of templates) {
      const target = path.join(tmp.path, template.id)
      await ProjectTemplate.create({
        id: template.id,
        name: template.name,
        target,
        initGit: false,
      })
      expect(JSON.parse(await fs.readFile(path.join(target, "config.json"), "utf8"))).toMatchObject({
        projections: {
          workspaceType: template.projections?.workspaceType,
        },
      })
    }
  })

  test("renders placeholders in Astro templates", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "team-docs")

    await ProjectTemplate.create({
      id: "docs-astro",
      name: "Team Docs",
      target,
      initGit: false,
    })

    expect(await fs.readFile(path.join(target, "src", "pages", "index.astro"), "utf8")).toContain(
      "<title>Team Docs</title>",
    )
    expect(await fs.readFile(path.join(target, "src", "content", "docs", "getting-started.md"), "utf8")).toContain(
      "The first article in Team Docs.",
    )
  })

  test("does not overwrite a non-empty target directory", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "existing")
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, "README.md"), "keep")

    await expect(
      ProjectTemplate.create({
        id: "mobile-expo",
        name: "Existing",
        target,
        initGit: false,
      }),
    ).rejects.toThrow("Target directory is not empty")
  })
})
