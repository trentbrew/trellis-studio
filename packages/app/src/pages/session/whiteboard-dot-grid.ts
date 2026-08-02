/** Dot grid painted in scene space (matches Excalidraw pan/zoom; see strokeGrid in Excalidraw 0.18). */

export type DotGridViewport = {
  scrollX: number
  scrollY: number
  zoom: number
  width: number
  height: number
  gridSize: number
  /** Kept for appState parity with Excalidraw; not used for dot styling. */
  gridStep: number
  theme: "light" | "dark"
}

/** Target minimum on-screen px between dots when zoomed out. */
export const MIN_DOT_SPACING_PX = 28

/** Hide the grid entirely below this zoom (canvas would look like noise). */
export const MIN_ZOOM_FOR_DOT_GRID = 0.05

export type DotGridLod = {
  visible: boolean
  /** Scene-space step between drawn dots. */
  drawStep: number
  /** 0–1 multiplier for dot alpha. */
  opacity: number
}

export function resolveDotGridLod(zoom: number, gridSize: number): DotGridLod {
  if (!Number.isFinite(zoom) || zoom < MIN_ZOOM_FOR_DOT_GRID || gridSize <= 0) {
    return { visible: false, drawStep: gridSize, opacity: 0 }
  }

  let drawStep = gridSize
  if (zoom < 0.45) {
    const stepPx = drawStep * zoom
    if (stepPx < MIN_DOT_SPACING_PX) {
      drawStep = gridSize * Math.ceil(MIN_DOT_SPACING_PX / stepPx)
    }
  }

  const opacity =
    zoom >= 0.45 ? 1 : zoom <= 0.12 ? 0.4 : 0.4 + ((zoom - 0.12) / (0.45 - 0.12)) * 0.6

  return { visible: true, drawStep, opacity }
}

export function paintWhiteboardDotGrid(
  ctx: CanvasRenderingContext2D,
  viewport: DotGridViewport,
) {
  const { scrollX, scrollY, zoom, width, height, gridSize, theme } = viewport
  if (width <= 0 || height <= 0 || gridSize <= 0) return

  const lod = resolveDotGridLod(zoom, gridSize)
  if (!lod.visible) {
    ctx.clearRect(0, 0, width, height)
    return
  }

  const { drawStep, opacity } = lod
  const offsetX = (scrollX % drawStep) - drawStep
  const offsetY = (scrollY % drawStep) - drawStep
  const radius = Math.max(0.5, Math.min(1.2, 1 / zoom))
  const fill =
    theme === "dark" ? `rgba(255, 255, 255, ${0.16 * opacity})` : `rgba(0, 0, 0, ${0.14 * opacity})`

  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.scale(zoom, zoom)

  const sceneW = width / zoom
  const sceneH = height / zoom

  for (let x = offsetX; x < offsetX + sceneW + drawStep * 2; x += drawStep) {
    for (let y = offsetY; y < offsetY + sceneH + drawStep * 2; y += drawStep) {
      ctx.beginPath()
      ctx.fillStyle = fill
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}
