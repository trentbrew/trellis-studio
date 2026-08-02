import { describe, test, expect } from "bun:test"
import { extract, resolve, shouldScan } from "../../src/trellis/imports"

describe("import scanner: extract", () => {
  test("es module imports", () => {
    const specs = extract(
      "src/Root.tsx",
      `
        import "./index.css"
        import { Composition } from "remotion"
        import { MyComposition } from "./Composition"
        import * as All from "../shared/utils"
      `,
    )
    expect(specs.sort()).toEqual(["../shared/utils", "./Composition", "./index.css", "remotion"].sort())
  })

  test("dynamic import + require", () => {
    const specs = extract(
      "src/a.ts",
      `
        const mod = await import("./lazy")
        const legacy = require("./legacy")
      `,
    )
    expect(specs.sort()).toEqual(["./lazy", "./legacy"].sort())
  })

  test("export from", () => {
    const specs = extract("index.ts", `export { default } from "./foo"\nexport * from "./bar"`)
    expect(specs.sort()).toEqual(["./bar", "./foo"].sort())
  })

  test("css @import and url()", () => {
    const specs = extract("styles.css", `@import "./reset.css";\n@import url("../theme/base.css");`)
    expect(specs.sort()).toEqual(["../theme/base.css", "./reset.css"].sort())
  })

  test("html link/script", () => {
    const specs = extract(
      "index.html",
      `<link rel="stylesheet" href="./style.css"><script src="./bundle.js"></script>`,
    )
    expect(specs.sort()).toEqual(["./bundle.js", "./style.css"].sort())
  })

  test("skips unsupported extensions", () => {
    expect(shouldScan("a.png")).toBe(false)
    expect(shouldScan("a.ts")).toBe(true)
    expect(shouldScan("a.css")).toBe(true)
    expect(shouldScan("a.md")).toBe(true)
  })
})

describe("import scanner: resolve", () => {
  const tracked = new Set<string>([
    "src/Root.tsx",
    "src/index.css",
    "src/Composition.tsx",
    "src/shared/utils.ts",
    "src/shared/index.ts",
    "packages/x/src/entry.ts",
  ])

  test("relative path with explicit extension", () => {
    expect(resolve("src/Root.tsx", "./index.css", tracked)).toBe("src/index.css")
  })

  test("relative path without extension (tries .tsx)", () => {
    expect(resolve("src/Root.tsx", "./Composition", tracked)).toBe("src/Composition.tsx")
  })

  test("relative path with index fallback", () => {
    expect(resolve("src/Root.tsx", "./shared", tracked)).toBe("src/shared/index.ts")
  })

  test("parent-directory climb", () => {
    expect(resolve("packages/x/src/entry.ts", "../../../src/Root.tsx", tracked)).toBe("src/Root.tsx")
  })

  test("workspace-absolute", () => {
    expect(resolve("src/Root.tsx", "/src/index.css", tracked)).toBe("src/index.css")
  })

  test("bare specifier returns null", () => {
    expect(resolve("src/Root.tsx", "remotion", tracked)).toBeNull()
    expect(resolve("src/Root.tsx", "@scope/pkg", tracked)).toBeNull()
  })

  test("remote URL returns null", () => {
    expect(resolve("index.html", "https://example.com/a.js", tracked)).toBeNull()
  })

  test("unknown relative returns null", () => {
    expect(resolve("src/Root.tsx", "./does-not-exist", tracked)).toBeNull()
  })
})
