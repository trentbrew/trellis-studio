import { afterEach, describe, expect, test } from "bun:test"
import { Env } from "../../src/env"
import { Instance } from "../../src/project/instance"
import { AudioEnrichment } from "../../src/util/audio-enrichment"
import { MediaAnalysis } from "../../src/util/media-analysis"
import { MusicAI } from "../../src/util/music-ai"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  MediaAnalysis.reset()
  MusicAI.reset()
  Env.remove("MUSIC_AI_API_KEY")
  await Instance.disposeAll()
})

describe("MusicAI", () => {
  test("uploads audio and parses cyanite metadata", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Env.set("MUSIC_AI_API_KEY", "test-key")
        MusicAI.configure({
          fetch: async (url, init) => {
            if (url.endsWith("/upload")) {
              return new Response(JSON.stringify({ uploadUrl: "https://upload.test/file", downloadUrl: "https://download.test/file" }))
            }
            if (url === "https://upload.test/file") {
              return new Response("", { status: 200 })
            }
            if (url.endsWith("/workflow?size=100")) {
              return new Response(
                JSON.stringify({
                  workflows: [{ slug: "cyanite-metadata", name: "Musical Metadata: Powered by Cyanite", description: "" }],
                }),
              )
            }
            if (url.endsWith("/job") && init?.method === "POST") {
              return new Response(JSON.stringify({ id: "job-1" }))
            }
            if (url.endsWith("/job/job-1")) {
              return new Response(
                JSON.stringify({
                  id: "job-1",
                  status: "SUCCEEDED",
                  result: { advanced: "https://cdn.test/advanced.json" },
                }),
              )
            }
            if (url === "https://cdn.test/advanced.json") {
              return new Response(
                JSON.stringify({
                  genreTags: "indie, rock",
                  moodTags: "dreamy, reflective",
                  energyLevel: "medium",
                  bpm: 118,
                  musicalKey: "A minor",
                }),
              )
            }
            throw new Error(`unexpected fetch: ${url}`)
          },
        })

        const result = await MusicAI.analyze(Buffer.from("audio"), "audio/mpeg", "track.mp3")
        expect(result?.genre).toEqual(["indie", "rock"])
        expect(result?.mood).toEqual(["dreamy", "reflective"])
        expect(result?.energy).toBe("medium")
        expect(result?.bpm).toBe(118)
        expect(result?.key).toBe("A minor")
      },
    })
  })
})

describe("AudioEnrichment", () => {
  test("routes speech files to transcript enrichment", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        MediaAnalysis.configure({
          local: async (input) => {
            if (input.prompt?.includes("Classify")) {
              return {
                text: '{"contentType":"speech","confidence":0.92,"reasoning":"spoken monologue"}',
                source: "local",
                elapsed: 0,
              }
            }
            return {
              text: '{"description":"Brainstorm about domains","tone":"casual","tags":["brainstorm","domains"],"transcript":"I lost the domain name..."}',
              source: "local",
              elapsed: 0,
            }
          },
        })

        const result = await AudioEnrichment.enrich({
          abs: "/tmp/yapping.mp3",
          rel: ".trellis/media/yapping.mp3",
          bytes: Buffer.from("audio"),
          mime: "audio/mpeg",
        })

        expect(result.kind).toBe("speech")
        expect(result.transcript).toContain("I lost the domain name")
        expect(result.audioAnalysis?.contentType).toBe("speech")
      },
    })
  })

  test("routes music files through music.ai and gemini description", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Env.set("MUSIC_AI_API_KEY", "test-key")
        MusicAI.configure({
          fetch: async (url, init) => {
            if (url.endsWith("/upload")) {
              return new Response(JSON.stringify({ uploadUrl: "https://upload.test/file", downloadUrl: "https://download.test/file" }))
            }
            if (url === "https://upload.test/file") return new Response("", { status: 200 })
            if (url.endsWith("/workflow?size=100")) {
              return new Response(
                JSON.stringify({
                  workflows: [{ slug: "cyanite-metadata", name: "Musical Metadata: Powered by Cyanite", description: "" }],
                }),
              )
            }
            if (url.endsWith("/job") && init?.method === "POST") return new Response(JSON.stringify({ id: "job-1" }))
            if (url.endsWith("/job/job-1")) {
              return new Response(
                JSON.stringify({
                  id: "job-1",
                  status: "SUCCEEDED",
                  result: { advanced: "https://cdn.test/advanced.json" },
                }),
              )
            }
            if (url === "https://cdn.test/advanced.json") {
              return new Response(JSON.stringify({ genreTags: "electronic", moodTags: "uplifting", bpm: 128 }))
            }
            throw new Error(`unexpected fetch: ${url}`)
          },
        })
        MediaAnalysis.configure({
          local: async (input) => {
            if (input.prompt?.includes("Classify")) {
              return {
                text: '{"contentType":"music","confidence":0.9,"reasoning":"structured song"}',
                source: "local",
                elapsed: 0,
              }
            }
            return {
              text: '{"description":"Upbeat electronic track","tone":"energetic","tags":["electronic","dance"]}',
              source: "local",
              elapsed: 0,
            }
          },
        })

        const result = await AudioEnrichment.enrich({
          abs: "/tmp/beat.mp3",
          rel: ".trellis/media/beat.mp3",
          bytes: Buffer.from("audio"),
          mime: "audio/mpeg",
        })

        expect(result.kind).toBe("music")
        expect(result.transcript).toBeUndefined()
        expect(result.audioAnalysis?.bpm).toBe(128)
        expect(result.audioAnalysis?.genre).toEqual(["electronic"])
        expect(result.tags).toContain("electronic")
      },
    })
  })
})
