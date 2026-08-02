/** Lazy-load the React/Excalidraw bridge (code-split from the Solid app). */

import type { ExcalidrawBundle } from "./excalidraw-bundle.types"

let cached: Promise<ExcalidrawBundle> | undefined

export type { ExcalidrawBundle } from "./excalidraw-bundle.types"

export function loadExcalidrawBundle(): Promise<ExcalidrawBundle> {
  if (!cached) {
    cached = import("./excalidraw-react-bridge") as Promise<ExcalidrawBundle>
  }
  return cached
}
