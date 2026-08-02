import type { ComponentType } from "react"
import type { createRoot } from "react-dom/client"

export type ExcalidrawProps = {
  theme?: "light" | "dark"
  name?: string
  UIOptions?: Record<string, unknown>
  initialData?: {
    elements: readonly Record<string, unknown>[]
    appState?: Record<string, unknown>
    files?: Record<string, unknown>
  }
  onChange?: (
    elements: readonly Record<string, unknown>[],
    appState: Record<string, unknown>,
    files: Record<string, unknown>,
  ) => void
}

export type ExcalidrawBundle = {
  Excalidraw: ComponentType<ExcalidrawProps>
  React: typeof import("react")
  createRoot: typeof createRoot
  exportToBlob: typeof import("@excalidraw/excalidraw").exportToBlob
  normalizeWhiteboardElements: (
    elements: readonly Record<string, unknown>[],
  ) => Record<string, unknown>[]
  mermaidToExcalidrawElements: (definition: string) => Promise<{
    elements: Record<string, unknown>[]
    files: Record<string, unknown>
  }>
}
