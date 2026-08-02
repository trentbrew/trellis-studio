import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import { Env } from "../../src/env"
import { Instance } from "../../src/project/instance"
import { MediaAnalysis } from "../../src/util/media-analysis"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  MediaAnalysis.reset()
  await Instance.disposeAll()
})

describe("MediaAnalysis", () => {
  test("uses local analysis before cloud", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let calls = 0
        MediaAnalysis.configure({
          fetch: async () => {
            calls++
            return new Response(JSON.stringify({ text: "cloud" }))
          },
          local: async () => ({ text: "local description", source: "local", elapsed: 0 }),
        })

        const result = await MediaAnalysis.analyze({
          bytes: Buffer.from("image"),
          mime: "image/png",
          filename: "screen.png",
        })

        expect(result.source).toBe("local")
        expect(result.text).toBe("local description")
        expect(calls).toBe(0)
      },
    })
  })

  test("loads gemini key from project dotenv before relay", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, ".env"), "GEMINI_API_KEY=test-key\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let relayCalls = 0
        let directCalls = 0
        MediaAnalysis.configure({
          fetch: async (url) => {
            if (String(url).includes("googleapis.com")) {
              directCalls++
              return new Response(
                JSON.stringify({
                  candidates: [{ content: { parts: [{ text: "dotenv description" }] } }],
                }),
                { status: 200 },
              )
            }
            relayCalls++
            return new Response(JSON.stringify({ text: "relay" }))
          },
        })

        const result = await MediaAnalysis.analyze({ bytes: Buffer.from("img"), mime: "image/png" })
        expect(result.source).toBe("cloud")
        expect(result.text).toBe("dotenv description")
        expect(directCalls).toBe(1)
        expect(relayCalls).toBe(0)
      },
    })
  })

  test("falls back to hosted cloud relay and caches results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let calls = 0
        Env.set("OPENCODE_DISABLE_DOTENV", "1")
        MediaAnalysis.configure({
          fetch: async (url, init) => {
            calls++
            const body = JSON.parse(String(init?.body))
            expect(String(url)).toBe("https://opencode.ai/zen/media/image/analyze")
            expect(body.mime).toBe("image/png")
            expect(body.data).toBe(Buffer.from("image").toString("base64"))
            return new Response(JSON.stringify({ text: "cloud description", model: "gemini-test" }), { status: 200 })
          },
        })

        const img = { bytes: Buffer.from("image"), mime: "image/png", filename: "screen.png" }
        const first = await MediaAnalysis.analyze(img)
        const second = await MediaAnalysis.analyze(img)

        expect(first.source).toBe("cloud")
        expect(first.text).toBe("cloud description")
        expect(first.model).toBe("gemini-test")
        expect(second.source).toBe("cloud")
        expect(calls).toBe(1)
      },
    })
  })

  test("uses direct gemini key before relay when env var is set", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let relayCalls = 0
        let directCalls = 0
        process.env.OPENCODE_GEMINI_API_KEY = "test-key"
        try {
          MediaAnalysis.configure({
            fetch: async (url) => {
              if (String(url).includes("googleapis.com")) {
                directCalls++
                return new Response(
                  JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "direct description" }] } }],
                  }),
                  { status: 200 },
                )
              }
              relayCalls++
              return new Response(JSON.stringify({ text: "relay" }))
            },
          })

          const result = await MediaAnalysis.analyze({ bytes: Buffer.from("img"), mime: "image/png" })
          expect(result.source).toBe("cloud")
          expect(result.text).toBe("direct description")
          expect(directCalls).toBe(1)
          expect(relayCalls).toBe(0)
        } finally {
          delete process.env.OPENCODE_GEMINI_API_KEY
        }
      },
    })
  })

  test("uses common gemini env aliases before relay", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let relayCalls = 0
        let directCalls = 0
        process.env.GEMINI_API_KEY = "test-key"
        try {
          MediaAnalysis.configure({
            fetch: async (url) => {
              if (String(url).includes("googleapis.com")) {
                directCalls++
                return new Response(
                  JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "alias description" }] } }],
                  }),
                  { status: 200 },
                )
              }
              relayCalls++
              return new Response(JSON.stringify({ text: "relay" }))
            },
          })

          const result = await MediaAnalysis.analyze({ bytes: Buffer.from("img"), mime: "image/png" })
          expect(result.source).toBe("cloud")
          expect(result.text).toBe("alias description")
          expect(directCalls).toBe(1)
          expect(relayCalls).toBe(0)
        } finally {
          delete process.env.GEMINI_API_KEY
        }
      },
    })
  })

  test("uses Gemini File API for audio attachments", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const calls: string[] = []
        process.env.GEMINI_API_KEY = "test-key"
        try {
          MediaAnalysis.configure({
            fetch: async (url, init) => {
              calls.push(String(url))
              if (String(url).includes("/upload/v1beta/files")) {
                expect(init?.headers).toMatchObject({ "X-Goog-Upload-Protocol": "multipart" })
                return new Response(
                  JSON.stringify({
                    file: {
                      uri: "https://generativelanguage.googleapis.com/v1beta/files/audio",
                      name: "files/audio",
                      state: "ACTIVE",
                      mimeType: "audio/mpeg",
                    },
                  }),
                  { status: 200 },
                )
              }
              if (String(url).includes(":generateContent")) {
                const body = JSON.parse(String(init?.body))
                expect(body.contents[0].parts[1].fileData).toMatchObject({
                  fileUri: "https://generativelanguage.googleapis.com/v1beta/files/audio",
                  mimeType: "audio/mpeg",
                })
                return new Response(
                  JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "audio transcript" }] } }],
                  }),
                  { status: 200 },
                )
              }
              return new Response("{}", { status: 200 })
            },
          })

          const result = await MediaAnalysis.analyze({
            bytes: Buffer.from("audio"),
            mime: "audio/mpeg",
            filename: "voice.mp3",
          })

          expect(result.source).toBe("cloud")
          expect(result.kind).toBe("audio")
          expect(result.text).toBe("audio transcript")
          expect(calls.some((url) => url.includes("/upload/v1beta/files"))).toBe(true)
        } finally {
          delete process.env.GEMINI_API_KEY
        }
      },
    })
  })

  test("requires direct Gemini key for non-image media without custom relay", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Env.set("OPENCODE_DISABLE_DOTENV", "1")
        let calls = 0
        MediaAnalysis.configure({
          fetch: async () => {
            calls++
            return new Response(JSON.stringify({ text: "cloud" }))
          },
        })

        const result = await MediaAnalysis.analyze({ bytes: Buffer.from("video"), mime: "video/mp4" })
        expect(result.source).toBe("unavailable")
        expect(result.kind).toBe("video")
        expect(result.reason).toContain("Gemini API key is required")
        expect(calls).toBe(0)
      },
    })
  })

  test("reports direct gemini failure when relay also fails", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        process.env.GEMINI_API_KEY = "test-key"
        try {
          MediaAnalysis.configure({
            fetch: async (url) => {
              if (String(url).includes("googleapis.com")) return new Response("bad key", { status: 403 })
              return new Response("missing", { status: 404 })
            },
          })

          const result = await MediaAnalysis.analyze({ bytes: Buffer.from("img"), mime: "image/png" })
          expect(result.source).toBe("unavailable")
          expect(result.reason).toContain("Gemini direct API failed: 403")
          expect(result.reason).toContain("Image analysis relay failed: 404")
        } finally {
          delete process.env.GEMINI_API_KEY
        }
      },
    })
  })

  test("honors cloud kill switch", async () => {
    await using tmp = await tmpdir({
      config: { media_analysis: { image: { allow_cloud: false } } },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let calls = 0
        MediaAnalysis.configure({
          fetch: async () => {
            calls++
            return new Response(JSON.stringify({ text: "cloud" }))
          },
        })

        const result = await MediaAnalysis.analyze({
          bytes: Buffer.from("image"),
          mime: "image/png",
          filename: "screen.png",
        })

        expect(result.source).toBe("unavailable")
        expect(result.reason).toContain("Cloud image analysis is disabled")
        expect(calls).toBe(0)
      },
    })
  })

  test("retries direct gemini on transient 503", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let directCalls = 0
        process.env.GEMINI_API_KEY = "test-key"
        try {
          MediaAnalysis.configure({
            fetch: async (url) => {
              if (String(url).includes("googleapis.com")) {
                directCalls++
                if (directCalls < 3) {
                  return new Response("high demand", { status: 503 })
                }
                return new Response(
                  JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "after retries" }] } }],
                  }),
                  { status: 200 },
                )
              }
              return new Response(JSON.stringify({ text: "relay" }))
            },
          })

          const result = await MediaAnalysis.analyze({ bytes: Buffer.from("img"), mime: "image/png" })
          expect(result.source).toBe("cloud")
          expect(result.text).toBe("after retries")
          expect(directCalls).toBe(3)
        } finally {
          delete process.env.GEMINI_API_KEY
        }
      },
    })
  })

  test("retries cloud relay on transient 503", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let relayCalls = 0
        Env.set("OPENCODE_DISABLE_DOTENV", "1")
        MediaAnalysis.configure({
          fetch: async (url) => {
            if (String(url).includes("opencode.ai")) {
              relayCalls++
              if (relayCalls < 2) return new Response("busy", { status: 503 })
              return new Response(JSON.stringify({ text: "relay ok" }), { status: 200 })
            }
            return new Response("missing", { status: 404 })
          },
        })

        const result = await MediaAnalysis.analyze({ bytes: Buffer.from("img"), mime: "image/png" })
        expect(result.source).toBe("cloud")
        expect(result.text).toBe("relay ok")
        expect(relayCalls).toBe(2)
      },
    })
  })

  test("does not retry direct gemini on 403", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let directCalls = 0
        let relayCalls = 0
        process.env.GEMINI_API_KEY = "test-key"
        try {
          MediaAnalysis.configure({
            fetch: async (url) => {
              if (String(url).includes("googleapis.com")) {
                directCalls++
                return new Response("bad key", { status: 403 })
              }
              relayCalls++
              return new Response("missing", { status: 404 })
            },
          })

          const result = await MediaAnalysis.analyze({ bytes: Buffer.from("img"), mime: "image/png" })
          expect(result.source).toBe("unavailable")
          expect(directCalls).toBe(1)
          expect(relayCalls).toBe(1)
        } finally {
          delete process.env.GEMINI_API_KEY
        }
      },
    })
  })
})
