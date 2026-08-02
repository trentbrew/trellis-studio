import { describe, expect, test } from "bun:test"
import {
  normalizeCanvasFillColor,
  preimageForDarkInvert,
  resolveStudioColorScheme,
  resolveWhiteboardCanvasBackground,
} from "./canvas-background"

describe("normalizeCanvasFillColor", () => {
  test("normalizes rgb to hex for Excalidraw fillStyle", () => {
    if (typeof document === "undefined") return
    expect(normalizeCanvasFillColor("rgb(16, 16, 16)")).toBe("#101010")
  })
})

describe("preimageForDarkInvert", () => {
  // Excalidraw applies invert(0.93) in dark mode; the pre-image of a near-black
  // target must be near-white so the filter renders it dark.
  test("maps a dark target to a near-white pre-image", () => {
    const pre = preimageForDarkInvert("#101010")
    const channel = parseInt(pre.slice(1, 3), 16)
    expect(channel).toBeGreaterThan(240)
  })

  test("inverting the pre-image reproduces the target", () => {
    const amount = 0.93
    const target = 0x10 / 255
    const pre = preimageForDarkInvert("#101010")
    const input = parseInt(pre.slice(1, 3), 16) / 255
    const out = (1 - amount) * input + amount * (1 - input)
    expect(Math.abs(out - target)).toBeLessThan(0.02)
  })
})

describe("resolveStudioColorScheme", () => {
  test("prefers data-color-scheme over theme argument", () => {
    if (typeof document === "undefined") return
    document.documentElement.dataset.colorScheme = "dark"
    expect(resolveStudioColorScheme("light")).toBe("dark")
    delete document.documentElement.dataset.colorScheme
  })

  test("reads data-color-scheme from documentElement", () => {
    if (typeof document === "undefined") return
    document.documentElement.dataset.colorScheme = "dark"
    expect(resolveStudioColorScheme()).toBe("dark")
    document.documentElement.dataset.colorScheme = "light"
    expect(resolveStudioColorScheme()).toBe("light")
    delete document.documentElement.dataset.colorScheme
  })
})

describe("resolveWhiteboardCanvasBackground", () => {
  test("returns a near-white pre-image in dark mode (filter renders it dark)", () => {
    const out = resolveWhiteboardCanvasBackground("dark")
    const channel = parseInt(out.slice(1, 3), 16)
    expect(channel).toBeGreaterThan(240)
  })

  test("returns the token directly in light mode (no canvas filter)", () => {
    if (typeof document === "undefined") return
    const el = document.createElement("div")
    el.style.setProperty("--background-base", "#f1f1f1")
    document.body.appendChild(el)
    delete document.documentElement.dataset.colorScheme
    expect(resolveWhiteboardCanvasBackground("light", el)).toBe("#f1f1f1")
    el.remove()
  })
})
