import { describe, expect, test } from "bun:test"
import { media } from "./media"

describe("media", () => {
  test("passes through absolute web and embedded urls", () => {
    expect(media("http://localhost:4096", "https://example.com/a.png")).toBe("https://example.com/a.png")
    expect(media("http://localhost:4096", "data:image/png;base64,abc")).toBe("data:image/png;base64,abc")
    expect(media("http://localhost:4096", "blob:http://localhost:4848/id")).toBe("blob:http://localhost:4848/id")
  })

  test("resolves backend media routes against the sdk base url", () => {
    expect(media("http://localhost:4096", "/file/media/hash.png")).toBe("http://localhost:4096/file/media/hash.png")
    expect(media("http://localhost:4096", "/file/media/hash.png", "/repo")).toBe(
      "http://localhost:4096/file/media/hash.png?directory=%2Frepo",
    )
  })

  test("maps legacy trellis media file paths back to backend media routes", () => {
    expect(media("http://localhost:4096", "/Users/trent/project/.trellis/media/hash name.png")).toBe(
      "http://localhost:4096/file/media/hash%20name.png",
    )
    expect(media("http://localhost:4096", ".trellis/media/hash.png", "/repo")).toBe(
      "http://localhost:4096/file/media/hash.png?directory=%2Frepo",
    )
    expect(media("http://localhost:4096", "C:\\trent\\project\\.trellis\\media\\hash.png")).toBe(
      "http://localhost:4096/file/media/hash.png",
    )
  })

  test("leaves unrelated relative paths alone", () => {
    expect(media("http://localhost:4096", "./image.png")).toBe("./image.png")
  })
})
