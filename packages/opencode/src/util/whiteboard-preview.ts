import path from "path"
import {
  buildWhiteboardPreviewInfo,
  parseWhiteboardRenderMeta,
  parseWhiteboard,
  sceneElementsKey,
  type WhiteboardPreviewInfo,
  whiteboardRenderPaths,
} from "@opencode-ai/whiteboard"
import { Filesystem } from "./filesystem"
import { Instance } from "../project/instance"

export async function loadWhiteboardPreview(
  filepath: string,
  raw?: string,
): Promise<WhiteboardPreviewInfo | undefined> {
  const rel = path.relative(Instance.directory, filepath).replace(/\\/g, "/")
  const doc = parseWhiteboard(raw ?? (await Filesystem.readText(filepath)))
  const render = whiteboardRenderPaths(rel)
  const metaAbs = path.join(Instance.directory, render.meta)
  const pngAbs = path.join(Instance.directory, render.png)
  const pngExists = await Filesystem.exists(pngAbs)
  if (!(await Filesystem.exists(metaAbs))) {
    return buildWhiteboardPreviewInfo(rel, doc, null, pngExists)
  }
  const meta = parseWhiteboardRenderMeta(await Filesystem.readText(metaAbs))
  return buildWhiteboardPreviewInfo(rel, doc, meta, pngExists)
}

export { sceneElementsKey, whiteboardRenderPaths }
