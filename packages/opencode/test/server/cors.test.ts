import { describe, expect, test } from "bun:test"
import { Server } from "../../src/server/server"

function req(path: string, origin: string, init?: RequestInit) {
  const app = Server.ControlPlaneRoutes()
  return app.request(path, {
    ...init,
    headers: {
      origin,
      ...(init?.headers ?? {}),
    },
  })
}

describe("server cors", () => {
  test("allows localhost origins", async () => {
    const origin = "http://localhost:4848"
    const res = await req("/global/config", origin)

    expect(res.headers.get("access-control-allow-origin")).toBe(origin)
  })

  test("allows desktop dev localhost origin", async () => {
    const origin = "http://localhost:1420"
    const res = await req("/global/config", origin)

    expect(res.headers.get("access-control-allow-origin")).toBe(origin)
  })

  test("allows private network origins", async () => {
    const origin = "http://192.168.68.54:4848"
    const res = await req("/global/config", origin)

    expect(res.headers.get("access-control-allow-origin")).toBe(origin)
  })

  test("allows preflight for private network origins", async () => {
    const origin = "http://192.168.68.54:4848"
    const res = await req("/global/mkdir", origin, {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    })

    expect(res.headers.get("access-control-allow-origin")).toBe(origin)
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
    expect(res.headers.get("access-control-allow-headers")).toContain("content-type")
  })

  test("blocks non-allowlisted public origins", async () => {
    const res = await req("/global/config", "http://example.com:4848")

    expect(res.headers.get("access-control-allow-origin")).toBeNull()
  })

  test("allows explicitly configured origins", async () => {
    const origin = "http://example.com:4848"
    const app = Server.ControlPlaneRoutes({ cors: [origin] })
    const res = await app.request("/global/config", {
      headers: {
        origin,
      },
    })

    expect(res.headers.get("access-control-allow-origin")).toBe(origin)
  })
})
