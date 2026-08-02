import { describe, expect, test } from "bun:test"
import z from "zod"
import { AssetTool } from "../../src/tool/asset"
import { ProviderTransform } from "../../src/provider/transform"
import type { Provider } from "../../src/provider/provider"

const bigPickle = {
  id: "big-pickle",
  providerID: "opencode",
  api: {
    id: "big-pickle",
    npm: "@ai-sdk/openai-compatible",
  },
} as Provider.Model

const codex = {
  id: "gpt-5.3-codex",
  providerID: "openai",
  api: {
    id: "gpt-5.3-codex",
    npm: "@ai-sdk/openai",
  },
} as Provider.Model

function hasTypeNull(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false
  if (Array.isArray(node)) return node.some(hasTypeNull)
  const obj = node as Record<string, unknown>
  if (obj.type === null) return true
  return Object.values(obj).some(hasTypeNull)
}

async function assetParameters() {
  const tool = await AssetTool.init()
  return tool.parameters
}

async function providerAssetSchema() {
  const parameters = await assetParameters()
  return ProviderTransform.schema(bigPickle, z.toJSONSchema(parameters))
}

describe("asset tool schema (Big Pickle / DeepSeek)", () => {
  test("raw Zod JSON schema is type object without type null", async () => {
    const raw = z.toJSONSchema(await assetParameters()) as Record<string, unknown>
    expect(raw.type).toBe("object")
    expect(hasTypeNull(raw)).toBe(false)
    const props = raw.properties as Record<string, unknown>
    expect(props.action).toBeDefined()
    expect((props.action as { enum?: string[] }).enum).toEqual(
      expect.arrayContaining(["generate_image_asset", "create_link_asset"]),
    )
  })

  test("ProviderTransform.schema keeps root type object for big-pickle", async () => {
    const schema = (await providerAssetSchema()) as Record<string, unknown>
    expect(schema.type).toBe("object")
    expect(hasTypeNull(schema)).toBe(false)
    expect(schema.properties).toBeDefined()
  })

  test("ProviderTransform.schema keeps root type object for gpt-5.3-codex", async () => {
    const parameters = await assetParameters()
    const schema = ProviderTransform.schema(codex, z.toJSONSchema(parameters)) as Record<string, unknown>
    expect(schema.type).toBe("object")
    expect(hasTypeNull(schema)).toBe(false)
    expect(schema.properties).toBeDefined()
  })

  test("matches session prompt tool registration path", async () => {
    const parameters = await assetParameters()
    const schema = ProviderTransform.schema(bigPickle, z.toJSONSchema(parameters)) as Record<string, unknown>
    expect(schema.type).toBe("object")
    expect(schema.type).not.toBeNull()
  })
})

describe("asset tool parameters validation", () => {
  test("accepts generate_image_asset when prompt is set", async () => {
    const parameters = await assetParameters()
    const parsed = parameters.parse({
      action: "generate_image_asset",
      prompt: "icon",
    })
    expect(parsed.action).toBe("generate_image_asset")
    expect(parsed.prompt).toBe("icon")
  })

  test("rejects generate_image_asset without prompt", async () => {
    const parameters = await assetParameters()
    expect(() =>
      parameters.parse({
        action: "generate_image_asset",
      }),
    ).toThrow()
  })

  test("accepts create_link_asset when url is set", async () => {
    const parameters = await assetParameters()
    const parsed = parameters.parse({
      action: "create_link_asset",
      url: "https://trellis.computer/docs",
    })
    expect(parsed.action).toBe("create_link_asset")
    expect(parsed.url).toBe("https://trellis.computer/docs")
  })

  test("rejects create_link_asset without url", async () => {
    const parameters = await assetParameters()
    expect(() =>
      parameters.parse({
        action: "create_link_asset",
      }),
    ).toThrow()
  })
})
