import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { DesignEntities } from "../../src/trellis/design-entities"
import { Trellis } from "../../src/trellis"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("design entities", () => {
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

  test("materialize icon is idempotent", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const first = DesignEntities.materializeIcon({ key: "sparkles", library: "lucide" }, dir)
        const second = DesignEntities.materializeIcon({ key: "sparkles", library: "lucide" }, dir)
        expect(first?.id).toBe(second?.id)
        expect(DesignEntities.listIcons({}, dir).some((icon) => icon.key === "sparkles")).toBe(true)
      },
    })
  })

  test("create palette stores swatches json", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const palette = DesignEntities.createPalette(
          {
            name: `Test ${Date.now()}`,
            swatches: { primary: "#111111", accent: "#ff0000" },
          },
          dir,
        )
        expect(palette?.swatches.primary).toBe("#111111")
        expect(palette?.swatches.accent).toBe("#ff0000")
      },
    })
  })

  test("update palette replaces swatches", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const palette = DesignEntities.createPalette(
          {
            name: `Patch ${Date.now()}`,
            swatches: { primary: "#111111" },
          },
          dir,
        )
        expect(palette?.id).toBeTruthy()
        const updated = DesignEntities.updatePalette(palette!.id, { swatches: { primary: "#222222", accent: "#abcdef" } }, dir)
        expect(updated?.swatches.primary).toBe("#222222")
        expect(updated?.swatches.accent).toBe("#abcdef")
      },
    })
  })
})
