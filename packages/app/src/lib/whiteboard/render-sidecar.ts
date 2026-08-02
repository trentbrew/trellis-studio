import {
  hasVisibleElements,
  needsVisualPreview,
  sceneElementsKey,
  serializeWhiteboardRenderMeta,
  whiteboardRenderPaths,
  type WhiteboardDocument,
} from "@/lib/whiteboard/schema"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"

type FileClient = OpencodeClient["file"]

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const idx = value.indexOf(",")
      resolve(idx === -1 ? value : value.slice(idx + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error("Failed to encode PNG"))
    reader.readAsDataURL(blob)
  })
}

export async function persistWhiteboardRenderSidecar(input: {
  file: FileClient
  whiteboardPath: string
  doc: WhiteboardDocument
  exportPreview: () => Promise<Blob | null>
}): Promise<void> {
  if (!hasVisibleElements(input.doc)) return
  if (!needsVisualPreview(input.doc)) return

  const blob = await input.exportPreview()
  if (!blob || blob.size === 0) return

  const key = sceneElementsKey(input.doc.elements)
  const paths = whiteboardRenderPaths(input.whiteboardPath)
  const base64 = await blobToBase64(blob)

  await input.file.write({
    fileWriteInput: {
      path: paths.png,
      content: base64,
      encoding: "base64",
      mimeType: "image/png",
    },
  })

  await input.file.write({
    fileWriteInput: {
      path: paths.meta,
      content: serializeWhiteboardRenderMeta({
        version: 1,
        whiteboardPath: input.whiteboardPath,
        elementsKey: key,
        updatedAt: new Date().toISOString(),
      }),
    },
  })
}
