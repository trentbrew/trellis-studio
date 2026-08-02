import { describe, expect, test } from "bun:test"
import { apiErrorMessage } from "./api-error"
import { mediaGenerateBody, mediaGenerateRequest, mediaGenerateUrl } from "./media-generate"

describe("mediaGenerateUrl", () => {
  test("builds the generate endpoint with directory query", () => {
    expect(mediaGenerateUrl("http://localhost:4096/", "/Users/me/project")).toBe(
      "http://localhost:4096/file/media/generate?directory=%2FUsers%2Fme%2Fproject",
    )
  })
})

describe("mediaGenerateBody", () => {
  test("includes prompt, provider, and defaults", () => {
    expect(mediaGenerateBody({ prompt: "A turtle", provider: "auto" })).toEqual({
      prompt: "A turtle",
      provider: "auto",
      size: "1024x1024",
      output_format: "png",
    })
  })
})

describe("mediaGenerateRequest", () => {
  test("combines url and json body for design panel fetch", () => {
    const { url, body } = mediaGenerateRequest("http://localhost:4096", "/repo", {
      prompt: "icon",
      provider: "openai",
    })
    expect(url).toBe("http://localhost:4096/file/media/generate?directory=%2Frepo")
    expect(body.provider).toBe("openai")
    expect(body.size).toBe("1024x1024")
  })
})

describe("apiErrorMessage for image generation", () => {
  test("surfaces server error strings from 400 responses", () => {
    expect(
      apiErrorMessage(
        { error: "OpenAI image generation failed (402): billing hard limit" },
        "Image generation failed",
      ),
    ).toBe("OpenAI image generation failed (402): billing hard limit")
  })

  test("falls back when body is empty", () => {
    expect(apiErrorMessage(null, "Image generation failed (400)")).toBe("Image generation failed (400)")
  })
})
