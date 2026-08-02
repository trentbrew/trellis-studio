import { describe, expect, test } from "bun:test"
import { InstanceRoutes } from "../../src/server/instance"
import { Log } from "../../src/util/log"

Log.init({ print: false })

describe("api fallback", () => {
  test("unknown json requests do not return html", async () => {
    const res = await InstanceRoutes().request("/missing/route", {
      headers: {
        accept: "application/json",
      },
    })

    expect(res.status).toBe(404)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(await res.json()).toEqual({
      error: "Not Found",
      path: "/missing/route",
    })
  })

  test("known api prefixes do not return html for wildcard accept", async () => {
    const res = await InstanceRoutes().request("/trellis/missing", {
      headers: {
        accept: "*/*",
      },
    })

    expect(res.status).toBe(404)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(await res.json()).toEqual({
      error: "Not Found",
      path: "/trellis/missing",
    })
  })
})
