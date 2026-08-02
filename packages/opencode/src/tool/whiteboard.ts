import z from "zod"
import path from "path"
import {
  applyTemplateToFile,
  describeWhiteboardFile,
  insertFigureToFile,
  insertMermaidToFile,
  isWhiteboardPath,
  listCorpusCatalog,
  listCorpusEntries,
  parseWhiteboard,
  serializeWhiteboard,
  suggestNextMermaidPosition,
  boundsForElements,
} from "@opencode-ai/whiteboard"
import { Tool } from "./tool"
import { Bus } from "../bus"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { assertExternalDirectory } from "./external-directory"
import { loadWhiteboardPreview } from "../util/whiteboard-preview"
import DESCRIPTION from "./whiteboard.txt"

const kindSchema = z.enum(["primitive", "figure", "layout", "template"])

const params = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list_catalog"),
    kind: kindSchema.optional(),
  }),
  z.object({
    action: z.literal("describe"),
    filePath: z.string().describe("Path to a .whiteboard file (relative to project root or absolute)"),
  }),
  z.object({
    action: z.literal("apply_template"),
    filePath: z.string(),
    templateId: z.string().describe("Corpus template id, e.g. template.sprint-retro"),
    replace: z.boolean().optional().describe("Replace the board instead of merging elements"),
  }),
  z.object({
    action: z.literal("insert_figure"),
    filePath: z.string(),
    figureId: z.string().describe("Corpus figure or primitive id, e.g. figure.mindmap-node"),
    x: z.number().describe("Canvas X position"),
    y: z.number().describe("Canvas Y position"),
    label: z.string().optional(),
    bind: z.string().optional().describe("Graph binding, e.g. issue:42 or binds:entity:decision-7"),
  }),
  z.object({
    action: z.literal("insert_mermaid"),
    filePath: z.string(),
    mermaid: z
      .string()
      .describe("Mermaid diagram source (flowchart works best; sequence/class partially supported)"),
    x: z.number().optional().describe("Canvas X position for the diagram's top-left (default 0)"),
    y: z.number().optional().describe("Canvas Y position for the diagram's top-left (default 0)"),
    label: z.string().optional(),
    bind: z.string().optional().describe("Graph binding, e.g. issue:42 or binds:entity:decision-7"),
  }),
])

function resolveWhiteboardPath(filePath: string): string {
  const filepath = path.isAbsolute(filePath) ? filePath : path.join(Instance.directory, filePath)
  if (!isWhiteboardPath(filepath)) {
    throw new Error(`Not a whiteboard file: ${filePath} (expected .whiteboard extension)`)
  }
  return filepath
}

export const WhiteboardTool = Tool.define<typeof params, Record<string, any>>("whiteboard", {
  description: DESCRIPTION,
  parameters: params,
  async execute(params, ctx) {
    if (params.action === "list_catalog") {
      const output = params.kind
        ? listCorpusEntries(params.kind)
            .map((e) => `${e.id} (v${e.version}) — ${e.description}`)
            .join("\n")
        : listCorpusCatalog()
      return {
        title: "Whiteboard corpus",
        metadata: { action: params.action },
        output,
      }
    }

    const filepath = resolveWhiteboardPath(params.filePath)
    await assertExternalDirectory(ctx, filepath)

    if (params.action === "describe") {
      const raw = (await Filesystem.exists(filepath)) ? await Filesystem.readText(filepath) : ""
      const rel = path.relative(Instance.directory, filepath)
      const preview = raw ? await loadWhiteboardPreview(filepath, raw) : undefined
      const output = describeWhiteboardFile(raw, rel, preview)
      return {
        title: `Describe ${rel}`,
        metadata: { action: params.action, filePath: rel },
        output,
      }
    }

    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(Instance.worktree, filepath)],
      always: ["*.whiteboard"],
      metadata: { filepath, action: params.action },
    })

    const existedBefore = await Filesystem.exists(filepath)
    const raw = existedBefore
      ? await Filesystem.readText(filepath)
      : serializeWhiteboard(parseWhiteboard(""))

    let next: string
    if (params.action === "apply_template") {
      next = applyTemplateToFile(raw, params.templateId, { replace: params.replace ?? false })
    } else if (params.action === "insert_mermaid") {
      const doc = parseWhiteboard(raw)
      const slot =
        params.x === undefined && params.y === undefined
          ? suggestNextMermaidPosition(boundsForElements(doc.elements))
          : { x: params.x ?? 0, y: params.y ?? 0 }
      next = insertMermaidToFile(raw, {
        mermaid: params.mermaid,
        x: slot.x,
        y: slot.y,
        label: params.label,
        bind: params.bind,
      })
    } else {
      next = insertFigureToFile(raw, params.figureId, {
        x: params.x,
        y: params.y,
        label: params.label,
        bind: params.bind,
      })
    }

    await Filesystem.write(filepath, next)

    // Notify the UI so whiteboard lists/editors refresh immediately (mirrors write.ts).
    Bus.publish(File.Event.Edited, { file: filepath })
    await Bus.publish(FileWatcher.Event.Updated, {
      file: filepath,
      event: existedBefore ? "change" : "add",
    })

    const rel = path.relative(Instance.directory, filepath)
    const summary = describeWhiteboardFile(next, rel)
    const note =
      params.action === "insert_mermaid"
        ? "\n\nThe diagram is stored as a pending mermaid node; Trellis Studio renders it to shapes when the board opens."
        : ""
    return {
      title: `${params.action} → ${rel}`,
      metadata: { action: params.action, filePath: rel },
      output: `Updated ${rel}.\n\n${summary}${note}`,
    }
  },
})
