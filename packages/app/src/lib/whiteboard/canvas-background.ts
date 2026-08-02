/** Canvas fill aligned with graph view (`bg-background-base` / `--background-base`). */

export const WHITEBOARD_CANVAS_BG_FALLBACK = {
  light: "#f8f8f8",
  dark: "#101010",
} as const

/**
 * Excalidraw renders dark mode by painting a light canvas and applying a CSS
 * `filter: invert(0.93) hue-rotate(180deg)` over the whole canvas. So the
 * `viewBackgroundColor` we feed it is the PRE-filter color; to make the canvas
 * *appear* as our dark `--background-base`, we must supply the pre-image that
 * the invert turns into that target. Painting a dark color directly would get
 * inverted to light gray (the bug this guards against).
 */
const EXCALIDRAW_DARK_INVERT = 0.93

/** Effective light/dark from the applied Studio theme (matches `data-color-scheme` on :root). */
export function resolveStudioColorScheme(theme?: "light" | "dark"): "light" | "dark" {
  if (typeof document !== "undefined") {
    const applied = document.documentElement.dataset.colorScheme
    if (applied === "dark" || applied === "light") return applied
  }
  if (theme === "dark" || theme === "light") return theme
  if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark"
  }
  return "light"
}

/** Excalidraw canvas `fillStyle` needs a parseable color; normalize computed tokens to #rrggbb. */
export function normalizeCanvasFillColor(raw: string): string | null {
  const trimmed = raw.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (!trimmed) return null
  if (typeof document === "undefined") return null
  try {
    const ctx = document.createElement("canvas").getContext("2d")
    if (!ctx) return null
    ctx.fillStyle = trimmed
    const normalized = ctx.fillStyle
    return typeof normalized === "string" && normalized.startsWith("#") ? normalized.toLowerCase() : null
  } catch {
    return null
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`
}

/**
 * Given the dark color we want the canvas to *appear*, return the pre-filter
 * color to set as `viewBackgroundColor` so Excalidraw's dark invert filter
 * produces it. CSS `invert(a)` per channel: out = (1-a)·in + a·(1-in).
 * Solving for `in`: in = (a - out) / (2a - 1). Hue-rotate is a no-op on grays
 * (the canvas background is effectively neutral), so we invert per-channel.
 */
export function preimageForDarkInvert(targetHex: string, amount = EXCALIDRAW_DARK_INVERT): string {
  const rgb = hexToRgb(targetHex)
  if (!rgb) return "#ffffff"
  const denom = 2 * amount - 1
  const solve = (channel: number) => {
    const out = channel / 255
    const input = (amount - out) / denom
    return input * 255
  }
  return rgbToHex(solve(rgb[0]), solve(rgb[1]), solve(rgb[2]))
}

/**
 * Resolve the `viewBackgroundColor` to feed Excalidraw so the canvas matches the
 * graph view (`--background-base`). In dark mode this returns the pre-invert
 * color (so the theme filter renders it dark); in light mode it returns the
 * token directly.
 */
export function resolveWhiteboardCanvasBackground(
  theme?: "light" | "dark",
  root?: HTMLElement | null,
): string {
  const scheme = resolveStudioColorScheme(theme)
  const probe = root ?? (typeof document !== "undefined" ? document.documentElement : null)
  let target: string | null = null
  if (probe && typeof getComputedStyle !== "undefined") {
    target = normalizeCanvasFillColor(getComputedStyle(probe).getPropertyValue("--background-base"))
  }
  if (!target) target = WHITEBOARD_CANVAS_BG_FALLBACK[scheme]
  return scheme === "dark" ? preimageForDarkInvert(target) : target
}
