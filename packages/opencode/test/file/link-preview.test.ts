import { describe, expect, test } from "bun:test"
import { fetchLinkPreview } from "../../src/file/link-preview"

describe("fetchLinkPreview", () => {
  test("parses og metadata from html", async () => {
    const html = `<!doctype html>
<html>
<head>
  <title>Example</title>
  <meta property="og:title" content="OG Title" />
  <meta property="og:description" content="A description" />
  <meta property="og:image" content="https://cdn.example.com/preview.png" />
  <link rel="icon" href="/icons/favicon.png" />
</head>
<body></body>
</html>`

    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })) as unknown as typeof fetch

    try {
      const preview = await fetchLinkPreview("https://example.com/page")
      expect(preview.title).toBe("OG Title")
      expect(preview.description).toBe("A description")
      expect(preview.image).toBe("https://cdn.example.com/preview.png")
      expect(preview.favicon).toBe("https://example.com/icons/favicon.png")
    } finally {
      globalThis.fetch = original
    }
  })

  test("rejects non-http urls", async () => {
    await expect(fetchLinkPreview("file:///tmp/x")).rejects.toThrow("invalid url")
  })
})
