import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import fs from "fs/promises"
import path from "path"
import { analyze, kind, supported, text } from "@opencode-ai/media-analysis"
import { z } from "zod"

function mimeOf(file: string, bytes: Buffer): string {
  const ext = path.extname(file).toLowerCase()
  const byExt: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  }
  if (byExt[ext]) return byExt[ext]
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png"
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
    return "application/pdf"
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "video/mp4"
  return "application/octet-stream"
}

const readArgs = z.object({
  path: z.string().describe("Absolute path to the file to read and analyze"),
  prompt: z.string().optional().describe("Optional custom analysis prompt"),
})

export async function run() {
  const server = new Server({ name: "opencode-media", version: "1.0.0" }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "media_analyze",
        description:
          "Analyze an image, audio, video, or document with Gemini (local key or cloud relay) and return a textual description. Use this when the model cannot natively read the file.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path to the media or document file" },
            prompt: { type: "string", description: "Optional custom analysis prompt" },
          },
          required: ["path"],
        },
      },
      {
        name: "media_read",
        description:
          "Smart read for a file. For media/documents it returns the AI analysis report; for plain text it returns the file contents.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path to the file" },
            prompt: { type: "string", description: "Optional custom analysis prompt (media only)" },
          },
          required: ["path"],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req: { params: { name: string; arguments?: unknown } }) => {
    const name = req.params.name
    const parsed = readArgs.safeParse(req.params.arguments)
    if (!parsed.success) return fail(parsed.error.message)
    const file = parsed.data.path
    const bytes = Buffer.from(await fs.readFile(file))
    const mime = mimeOf(file, bytes)

    if (name === "media_read" && !supported(mime)) {
      const textContent = (await fs.readFile(file, "utf8")).slice(0, 200_000)
      return ok([{ type: "text", text: textContent }])
    }

    const result = await analyze({
      bytes,
      mime,
      filename: path.basename(file),
      prompt: parsed.data.prompt,
    })
    const out = supported(mime) ? text({ filename: path.basename(file), result }) : result.text
    return ok([{ type: "text", text: out }])
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

function ok(content: { type: "text"; text: string }[]) {
  return { content, isError: false }
}

function fail(message: string) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true }
}

run().catch((err) => {
  console.error("media-mcp failed", err)
  process.exit(1)
})
