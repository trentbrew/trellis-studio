import { repairElementIndices } from "./indices"
import { EXCALIDRAW_FONT_HELVETICA } from "./ontology"

/**
 * Recompute Excalidraw text box dimensions when `autoResize` is enabled.
 * Agents often update `text` without refreshing width/height; Excalidraw only
 * auto-sizes during in-canvas editing, not when loading JSON from disk.
 */

const TEXT_PADDING = 10

/** Excalidraw fontFamily numeric ids → CSS stack (matches defaults in 0.18). */
const FONT_FAMILY_CSS: Record<number, string> = {
  1: '"Virgil", "Segoe UI Emoji", sans-serif',
  2: 'Helvetica, "Segoe UI Emoji", sans-serif',
  3: 'Cascadia, "Segoe UI Emoji", sans-serif',
  5: '"Excalifont", Xiaolai, "Segoe UI Emoji", sans-serif',
  6: 'Nunito, "Segoe UI Emoji", sans-serif',
  7: '"Lilita One", "Segoe UI Emoji", sans-serif',
  8: '"Comic Shanns", "Segoe UI Emoji", sans-serif',
  9: '"Liberation Sans", "Segoe UI Emoji", sans-serif',
}

const DEFAULT_FONT_FAMILY = EXCALIDRAW_FONT_HELVETICA
const DEFAULT_FONT_SIZE = 20
const DEFAULT_LINE_HEIGHT = 1.25

function fontCss(fontSize: number, fontFamily: number): string {
  const family = FONT_FAMILY_CSS[fontFamily] ?? FONT_FAMILY_CSS[DEFAULT_FONT_FAMILY]!
  return `${fontSize}px ${family}`
}

export function measureExcalidrawText(
  text: string,
  fontSize: number,
  fontFamily: number,
  lineHeight: number,
): { width: number; height: number } {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const linePx = fontSize * lineHeight

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.font = fontCss(fontSize, fontFamily)
      let maxWidth = 0
      for (const line of lines) {
        maxWidth = Math.max(maxWidth, ctx.measureText(line || " ").width)
      }
      return {
        width: Math.ceil(maxWidth) + TEXT_PADDING,
        height: Math.ceil(lines.length * linePx) + TEXT_PADDING,
      }
    }
  }

  const charWidth = fontSize * 0.55
  const maxWidth = Math.max(...lines.map((line) => line.length * charWidth), charWidth)
  return {
    width: Math.ceil(maxWidth) + TEXT_PADDING,
    height: Math.ceil(lines.length * linePx) + TEXT_PADDING,
  }
}

function readTextMetrics(el: Record<string, unknown>) {
  const text = typeof el.text === "string" ? el.text : ""
  const fontSize = typeof el.fontSize === "number" ? el.fontSize : DEFAULT_FONT_SIZE
  const fontFamily = typeof el.fontFamily === "number" ? el.fontFamily : DEFAULT_FONT_FAMILY
  const lineHeight = typeof el.lineHeight === "number" ? el.lineHeight : DEFAULT_LINE_HEIGHT
  return { text, fontSize, fontFamily, lineHeight }
}

/** Fit a single text element; no-op for bound/fixed-size text. */
export function fitTextElement(el: Record<string, unknown>): Record<string, unknown> {
  if (el.type !== "text" || el.isDeleted === true) return el
  if (el.autoResize === false) return el
  if (el.containerId != null && el.containerId !== "") return el

  const { text, fontSize, fontFamily, lineHeight } = readTextMetrics(el)
  const { width, height } = measureExcalidrawText(text, fontSize, fontFamily, lineHeight)

  const curW = typeof el.width === "number" ? el.width : 0
  const curH = typeof el.height === "number" ? el.height : 0
  if (Math.abs(width - curW) < 2 && Math.abs(height - curH) < 2) {
    return el.autoResize === true ? el : { ...el, autoResize: true }
  }

  return {
    ...el,
    autoResize: true,
    width,
    height,
    originalText: typeof el.originalText === "string" ? el.originalText : text,
  }
}

export function normalizeTextElements(
  elements: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return repairElementIndices(elements.map((el) => fitTextElement(el)))
}
