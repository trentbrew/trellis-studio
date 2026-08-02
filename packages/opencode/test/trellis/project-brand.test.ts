import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { DesignEntities } from "../../src/trellis/design-entities"
import { DesignSeed } from "../../src/trellis/design-seed"
import { ProjectBrand } from "../../src/trellis/project-brand"
import { findBrandTemplatePreset } from "../../src/trellis/brand-template-presets"
import { Trellis } from "../../src/trellis"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("project brand", () => {
  let dir: string
  let cleanup: { [Symbol.asyncDispose](): Promise<void> }
  const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
  const watch = proto.watch

  beforeAll(async () => {
    proto.watch = () => undefined
    const tmp = await tmpdir({ git: true })
    cleanup = tmp
    dir = tmp.path
    await Instance.provide({ directory: dir, fn: () => Trellis.init(dir) })
  })

  afterAll(async () => {
    proto.watch = watch
    Trellis.dispose(dir)
    await cleanup[Symbol.asyncDispose]()
  })

  test("seed creates brand config and resolved snapshot", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        DesignSeed.ensure(dir)
        const snapshot = ProjectBrand.getResolved(dir)
        expect(snapshot?.name).toBe("Project Brand")
        expect(snapshot?.palettes.length).toBeGreaterThan(0)
        expect(snapshot?.fonts.length).toBeGreaterThan(0)
        expect(snapshot?.icons.length).toBeGreaterThan(0)
        expect(snapshot?.semantics?.tone).toContain("clear")
      },
    })
  })

  test("overrides merge into resolved snapshot", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const inter = DesignEntities.findFontByFamily("Inter", dir)
        expect(inter).toBeTruthy()
        ProjectBrand.setConfig({ overrides: { bodyFontId: inter!.id } }, dir)
        const snapshot = ProjectBrand.refreshSnapshot(dir)
        expect(snapshot?.bodyFontId).toBe(inter!.id)
      },
    })
  })

  test("apply cloud template materializes brand and sets activeBrandId", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const template = findBrandTemplatePreset("preset:warm-studio")
        expect(template).toBeTruthy()
        const snapshot = ProjectBrand.applyCloudTemplate(template!, dir)
        expect(snapshot?.name).toBe("Warm Studio")
        expect(snapshot?.cloudTemplateId).toBe("preset:warm-studio")
        expect(snapshot?.cloudTemplateVersion).toBe(1)
        expect(snapshot?.palettes.some((palette) => palette.name === "Warm Studio")).toBe(true)

        const config = ProjectBrand.getConfig(dir)
        expect(config?.activeBrandId).toBe("preset:warm-studio")
        expect(config?.activeBrandVersion).toBe(1)
        expect(config?.localBrandId).toBeTruthy()
      },
    })
  })
})
