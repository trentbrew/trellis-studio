import path from "path"
import z from "zod"
import { Tool } from "./tool"
import * as ImageGeneration from "../file/image-generation"
import * as LinkAsset from "../file/link-asset"
import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { FileWatcher } from "../file/watcher"
import { Trellis } from "../trellis"

// Flat object schema (not discriminatedUnion) — DeepSeek / Big Pickle reject tool
// schemas whose root is not `type: "object"` (Zod unions can emit `type: null`).
const params = z
  .object({
    action: z.enum(["generate_image_asset", "create_link_asset"]),
    url: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    prompt: z.string().trim().min(1).max(32_000).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    provider: z.enum(["auto", "openai", "gemini"]).optional(),
    model: z.string().trim().min(1).optional(),
    size: z
      .string()
      .trim()
      .regex(/^(auto|\d{2,5}x\d{2,5})$/)
      .optional(),
    quality: z.enum(["auto", "low", "medium", "high"]).optional(),
    background: z.enum(["auto", "opaque", "transparent"]).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    output_format: z.enum(["png", "jpeg", "webp"]).optional(),
    output_compression: z.number().int().min(0).max(100).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.action === "create_link_asset") {
      if (!input.url?.trim()) {
        ctx.addIssue({ code: "custom", message: "url is required for create_link_asset", path: ["url"] })
      }
      return
    }
    if (!input.prompt?.trim()) {
      ctx.addIssue({ code: "custom", message: "prompt is required for generate_image_asset", path: ["prompt"] })
    }
  })

export const AssetTool = Tool.define<typeof params, Record<string, any>>("asset", {
  description: [
    "Create and manage design/media assets in the current Trellis Studio project.",
    "",
    "**create_link_asset** — Save a bookmark/reference URL to the asset library (Design panel → Links).",
    "Use when the user shares URLs they may reuse: docs, references, inspiration, bookmarks.",
    "Do NOT create a CMS collection for simple bookmarks. Dedupe by URL (same URL → one asset).",
    "Proceed without asking where to store the link.",
    "",
    "**generate_image_asset** — Create an image, icon, illustration, texture, or mockup.",
    "Saves to `.trellis/media` and returns the project-relative path for CMS fields, design assets, or UI code.",
    "",
    "Providers (images): `auto` (default, prefers Gemini when GEMINI_API_KEY is set), `gemini`, or `openai`.",
    "Set `provider: \"gemini\"` to force Gemini. Keys are read from the project `.env` or shell environment.",
    "",
    "Image defaults: size `1024x1024`, output format `png`. OpenAI defaults to `gpt-image-2`; Gemini defaults to",
    "`gemini-2.5-flash-image`. Override with `model`, GEMINI_IMAGE_MODEL, or OPENAI_IMAGE_MODEL.",
  ].join("\n"),
  parameters: params,
  async execute(input, ctx) {
    if (input.action === "create_link_asset") {
      const url = input.url?.trim()
      if (!url) throw new Error("url is required for create_link_asset")

      await ctx.ask({
        permission: "edit",
        patterns: [".trellis/assets/*"],
        always: [".trellis/assets/*"],
        metadata: { action: input.action, url },
      })

      const asset = await LinkAsset.create(
        {
          url,
          title: input.title,
          description: input.description,
        },
        Instance.directory,
      )

      void Trellis.record({
        tool: "asset.create_link_asset",
        sessionID: ctx.sessionID,
        args: { url: asset.url },
        output: asset.path,
        agent: ctx.agent,
      }).catch(() => undefined)

      return {
        title: asset.name,
        metadata: asset,
        output: `Saved link asset at ${asset.path} (${asset.url})`,
      }
    }

    const prompt = input.prompt?.trim()
    if (!prompt) throw new Error("prompt is required for generate_image_asset")

    const image = {
      prompt,
      name: input.name,
      provider: input.provider,
      model: input.model,
      size: input.size,
      quality: input.quality,
      background: input.background,
      moderation: input.moderation,
      output_format: input.output_format,
      output_compression: input.output_compression,
    }

    await ctx.ask({
      permission: "edit",
      patterns: [".trellis/media/*"],
      always: [".trellis/media/*"],
      metadata: { action: input.action, prompt },
    })

    const img = await ImageGeneration.generate(image, ctx.abort)
    const asset = await ImageGeneration.save(Instance.directory, img, image)
    const abs = path.join(Instance.directory, asset.path)

    await Bus.publish(FileWatcher.Event.Updated, { file: abs, event: "add" })
    await ImageGeneration.annotate(Instance.directory, asset, image).catch(() => {})

    return {
      title: asset.name,
      metadata: asset,
      output: `Generated image asset at ${asset.path}`,
      attachments: [
        {
          type: "file",
          mime: img.mime,
          filename: asset.name,
          url: `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}`,
        },
      ],
    }
  },
})
