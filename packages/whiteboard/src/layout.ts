/**
 * Whiteboard layout helpers — spacing agent/mermaid diagrams on the canvas.
 */

export type SceneBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

const PADDING = 8

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/** Axis-aligned bounds for one Excalidraw element (best-effort for lines/arrows). */
export function boundsForElement(el: Record<string, unknown>): SceneBounds | null {
  const x = num(el.x)
  const y = num(el.y)
  if (x === undefined || y === undefined) return null

  const w = num(el.width) ?? 0
  const h = num(el.height) ?? 0
  let minX = x
  let minY = y
  let maxX = x + w
  let maxY = y + h

  const points = el.points
  if (Array.isArray(points)) {
    for (const pt of points) {
      if (!Array.isArray(pt) || pt.length < 2) continue
      const px = x + Number(pt[0])
      const py = y + Number(pt[1])
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }
  }

  if (maxX <= minX && maxY <= minY) {
    maxX = minX + 1
    maxY = minY + 1
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function mergeBounds(a: SceneBounds | null, b: SceneBounds | null): SceneBounds | null {
  if (!a) return b
  if (!b) return a
  const minX = Math.min(a.minX, b.minX)
  const minY = Math.min(a.minY, b.minY)
  const maxX = Math.max(a.maxX, b.maxX)
  const maxY = Math.max(a.maxY, b.maxY)
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function boundsForElements(
  elements: readonly Record<string, unknown>[],
  filter?: (el: Record<string, unknown>) => boolean,
): SceneBounds | null {
  let out: SceneBounds | null = null
  for (const el of elements) {
    if (el.isDeleted === true) continue
    if (filter && !filter(el)) continue
    out = mergeBounds(out, boundsForElement(el))
  }
  return out
}

export function translateElements(
  elements: readonly Record<string, unknown>[],
  dx: number,
  dy: number,
): Record<string, unknown>[] {
  if (dx === 0 && dy === 0) return elements.map((el) => ({ ...el }))
  return elements.map((raw) => {
    const el: Record<string, unknown> = { ...raw }
    if (typeof el.x === "number") el.x = el.x + dx
    if (typeof el.y === "number") el.y = el.y + dy
    return el
  })
}

/** Gap between stacked mermaid diagram groups (px). */
export const MERMAID_DIAGRAM_GAP = 120

/** Origin for the first auto-placed diagram when the board is empty. */
export const MERMAID_AUTO_ORIGIN = { x: 80, y: 80 }

/**
 * Next top-left for a mermaid group given everything already on the board.
 * Stacks vertically below existing content.
 */
export function suggestNextMermaidPosition(existing: SceneBounds | null): { x: number; y: number } {
  if (!existing) return { ...MERMAID_AUTO_ORIGIN }
  return {
    x: MERMAID_AUTO_ORIGIN.x,
    y: existing.maxY + MERMAID_DIAGRAM_GAP,
  }
}

/**
 * If the placeholder sits at the default origin while other content exists,
 * or overlaps existing bounds, move the group to a clear slot below.
 */
export function resolveMermaidPlacement(
  placeholder: Record<string, unknown>,
  group: readonly Record<string, unknown>[],
  occupied: SceneBounds | null,
): { elements: Record<string, unknown>[]; placed: SceneBounds | null } {
  const groupBounds = boundsForElements(group)
  if (!groupBounds) return { elements: [...group], placed: occupied }

  const px = num(placeholder.x) ?? 0
  const py = num(placeholder.y) ?? 0
  const atDefaultOrigin = px <= 1 && py <= 1
  const overlaps =
    occupied &&
    !(
      groupBounds.maxX + PADDING < occupied.minX ||
      groupBounds.minX - PADDING > occupied.maxX ||
      groupBounds.maxY + PADDING < occupied.minY ||
      groupBounds.minY - PADDING > occupied.maxY
    )

  let dx = 0
  let dy = 0
  if (occupied && (atDefaultOrigin || overlaps)) {
    const slot = suggestNextMermaidPosition(occupied)
    dx = slot.x - groupBounds.minX
    dy = slot.y - groupBounds.minY
  }

  const placed = boundsForElements(translateElements(group, dx, dy))
  return {
    elements: translateElements(group, dx, dy),
    placed: mergeBounds(occupied, placed),
  }
}

/** Looser spacing for dense mermaid output (element count heuristic). */
export function suggestReadabilityScale(elementCount: number): number {
  if (elementCount < 16) return 1
  if (elementCount < 28) return 1.15
  if (elementCount < 45) return 1.25
  return 1.35
}

function scaleCoord(value: number, origin: number, scale: number): number {
  return origin + (value - origin) * scale
}

/** Uniform scale around an origin (expands node spacing for crowded diagrams). */
export function scaleElementsFromOrigin(
  elements: readonly Record<string, unknown>[],
  scale: number,
  origin: { x: number; y: number },
): Record<string, unknown>[] {
  if (scale === 1) return elements.map((el) => ({ ...el }))
  return elements.map((raw) => {
    const el: Record<string, unknown> = { ...raw }
    if (typeof el.x === "number") el.x = scaleCoord(el.x, origin.x, scale)
    if (typeof el.y === "number") el.y = scaleCoord(el.y, origin.y, scale)
    if (typeof el.width === "number") el.width = (el.width as number) * scale
    if (typeof el.height === "number") el.height = (el.height as number) * scale
    if (typeof el.fontSize === "number") el.fontSize = Math.round((el.fontSize as number) * scale)
    const points = el.points
    if (Array.isArray(points)) {
      el.points = points.map((pt) => {
        if (!Array.isArray(pt) || pt.length < 2) return pt
        return [Number(pt[0]) * scale, Number(pt[1]) * scale]
      })
    }
    return el
  })
}
