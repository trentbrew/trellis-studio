import { describe, it, expect } from "bun:test"
import { graphPreload, preload, invalidatePreload } from "./graph-preloader"

describe("Graph Preloader", () => {
  it("should export the module store", () => {
    expect(graphPreload).toBeDefined()
    expect(graphPreload.data).toBeNull()
    expect(graphPreload.loading).toBe(false)
  })

  it("should export preload and invalidatePreload functions", () => {
    expect(typeof preload).toBe("function")
    expect(typeof invalidatePreload).toBe("function")
  })

  it("should clear data on invalidatePreload", () => {
    invalidatePreload()
    expect(graphPreload.data).toBeNull()
    expect(graphPreload.loading).toBe(false)
  })
})
