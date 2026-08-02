import { describe, expect, test } from "bun:test"
import {
  normalizeEmbeddableLink,
  normalizeEmbeddableElements,
  spotifyEmbedUrl,
  youtubeVideoId,
} from "./embed-link"

describe("youtubeVideoId", () => {
  test("parses watch, share, shorts, live, and music URLs", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://www.youtube.com/live/abc123xyz")).toBe("abc123xyz")
    expect(youtubeVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  test("rejects homepage and channel URLs", () => {
    expect(youtubeVideoId("https://www.youtube.com/")).toBeUndefined()
    expect(youtubeVideoId("https://www.youtube.com/@channel")).toBeUndefined()
  })
})

describe("normalizeEmbeddableLink", () => {
  test("rewrites YouTube watch URLs to embed URLs", () => {
    expect(normalizeEmbeddableLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1",
    )
  })

  test("rewrites Spotify share URLs to embed URLs", () => {
    expect(normalizeEmbeddableLink("https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6")).toBe(
      "https://open.spotify.com/embed/track/6rqhFgbbKwnb9MLmUQDhG6",
    )
    expect(normalizeEmbeddableLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
    )
  })

  test("passes through non-video URLs", () => {
    expect(normalizeEmbeddableLink("https://example.com/page")).toBe("https://example.com/page")
  })
})

describe("spotifyEmbedUrl", () => {
  test("parses share, locale, URI, and legacy embed URLs", () => {
    expect(spotifyEmbedUrl("https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6")).toBe(
      "https://open.spotify.com/embed/track/6rqhFgbbKwnb9MLmUQDhG6",
    )
    expect(spotifyEmbedUrl("https://open.spotify.com/intl-de/album/abc123")).toBe(
      "https://open.spotify.com/embed/album/abc123",
    )
    expect(spotifyEmbedUrl("spotify:episode:512ojhOOP1BRJKGjzNgJXP")).toBe(
      "https://open.spotify.com/embed/episode/512ojhOOP1BRJKGjzNgJXP",
    )
    expect(
      spotifyEmbedUrl("https://embed.spotify.com/?uri=spotify:track:6rqhFgbbKwnb9MLmUQDhG6"),
    ).toBe("https://open.spotify.com/embed/track/6rqhFgbbKwnb9MLmUQDhG6")
  })

  test("leaves canonical embed URLs unchanged", () => {
    const embed = "https://open.spotify.com/embed/track/6rqhFgbbKwnb9MLmUQDhG6?utm_source=generator"
    expect(spotifyEmbedUrl(embed)).toBe(embed)
  })
})

describe("normalizeEmbeddableElements", () => {
  test("updates embeddable element links in place", () => {
    const elements = [
      { type: "rectangle", link: null },
      {
        type: "embeddable",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    ]
    const next = normalizeEmbeddableElements(elements)
    expect(next[1]?.link).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1")
  })

  test("returns the same array reference when nothing changed", () => {
    const elements = [{ type: "rectangle" }]
    expect(normalizeEmbeddableElements(elements)).toBe(elements)
  })
})
