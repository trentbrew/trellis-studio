import { describe, expect, test } from "bun:test"
import { clean, cloudLocalPreviewUrl, frame, port, route, same, web } from "./preview-url"

describe("preview url helpers", () => {
  test("normalizes bare localhost ports before protocol detection", () => {
    expect(clean("localhost:5173")).toBe("http://localhost:5173")
    expect(clean("127.0.0.1:3000/path?q=1")).toBe("http://127.0.0.1:3000/path?q=1")
    expect(clean("lccalhost:5173")).toBe("http://lccalhost:5173")
  })

  test("preserves explicit web schemes and rejects non-web schemes", () => {
    expect(clean("http://localhost:5173")).toBe("http://localhost:5173")
    expect(clean("https://example.com/docs")).toBe("https://example.com/docs")
    expect(web("mailto:test@example.com")).toBe(false)
  })

  test("extracts proxy matching information", () => {
    expect(port("localhost:5173/foo")).toBe(5173)
    expect(same("localhost:5173", "http://localhost:5173/foo")).toBe(true)
    expect(route("localhost:5173/foo?x=1#top", "http://localhost:5173")).toBe("/foo?x=1#top")
  })

  test("routes external pages through the browse proxy", () => {
    expect(frame("https://nlnet.nl/propose/", "http://localhost:4096", "/tmp/project")).toBe(
      "http://localhost:4096/preview/browse?url=https%3A%2F%2Fnlnet.nl%2Fpropose%2F&directory=%2Ftmp%2Fproject",
    )
    expect(frame("localhost:5173", "http://localhost:4096", "/tmp/project")).toBe("http://localhost:5173")
  })

  describe("cloudLocalPreviewUrl", () => {
    const e2b = { hostname: "3333-id80985wpb.e2b.app", protocol: "https:" }

    test("maps a local dev port onto the sandbox public host", () => {
      expect(cloudLocalPreviewUrl("http://localhost:8000", e2b)).toBe("https://8000-id80985wpb.e2b.app/")
      expect(cloudLocalPreviewUrl("localhost:5173/foo?x=1#top", e2b)).toBe("https://5173-id80985wpb.e2b.app/foo?x=1#top")
      expect(cloudLocalPreviewUrl("http://127.0.0.1:3000", e2b)).toBe("https://3000-id80985wpb.e2b.app/")
    })

    test("defaults to port 80 when none is given", () => {
      expect(cloudLocalPreviewUrl("http://localhost", e2b)).toBe("https://80-id80985wpb.e2b.app/")
    })

    test("ignores non-local URLs", () => {
      expect(cloudLocalPreviewUrl("https://example.com", e2b)).toBeUndefined()
    })

    test("no-ops when not on a cloud sandbox host", () => {
      expect(cloudLocalPreviewUrl("http://localhost:8000", { hostname: "localhost", protocol: "http:" })).toBeUndefined()
      expect(
        cloudLocalPreviewUrl("http://localhost:8000", { hostname: "studio.trellis.computer", protocol: "https:" }),
      ).toBeUndefined()
    })
  })
})
