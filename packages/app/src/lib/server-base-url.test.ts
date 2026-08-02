import { describe, expect, test } from "bun:test"
import { serverBaseUrl, workspacePathPrefix } from "./server-base-url"

describe("workspacePathPrefix", () => {
  test("extracts valid workspace segment", () => {
    const dir = "/home/user/workspace/my-project"
    const encoded = Buffer.from(dir)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
    expect(workspacePathPrefix(`/${encoded}/session`)).toBe(`/${encoded}`)
  })

  test("ignores /global/event", () => {
    expect(workspacePathPrefix("/global/event")).toBeUndefined()
  })

  test("ignores /permission false positive", () => {
    expect(workspacePathPrefix("/permission")).toBeUndefined()
  })
})

describe("serverBaseUrl", () => {
  test("includes workspace prefix when pathname has encoded dir", () => {
    const dir = "/home/user/workspace"
    const encoded = Buffer.from(dir)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
    const original = globalThis.location
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        origin: "https://3333-abc.e2b.app",
        pathname: `/${encoded}/`,
      },
    })
    expect(serverBaseUrl()).toBe(`https://3333-abc.e2b.app/${encoded}`)
    Object.defineProperty(globalThis, "location", { configurable: true, value: original })
  })
})
