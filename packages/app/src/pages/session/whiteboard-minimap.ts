/** Canvas minimap for Excalidraw scenes (graph-view style). */

export type WhiteboardMinimapElement = {
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
}

export type WhiteboardMinimapViewport = {
  scrollX: number
  scrollY: number
  zoom: number
  width: number
  height: number
}

export type WhiteboardMinimapHandle = {
  update: (opts: {
    elements: readonly WhiteboardMinimapElement[]
    viewport: WhiteboardMinimapViewport
  }) => void
  /** Show the minimap, then auto-hide after inactivity (transient, like the zoom HUD). */
  reveal: () => void
  destroy: () => void
}

const MAP_W = 180
const MAP_H = 120
const MAP_PAD = 6
/** Keep the minimap on screen briefly after the last pan/zoom. */
const MINIMAP_HIDE_MS = 1400

type Bounds = { minX: number; minY: number; maxX: number; maxY: number; scale: number }

function elementBounds(el: WhiteboardMinimapElement) {
  const w = Number.isFinite(el.width) ? el.width : 0
  const h = Number.isFinite(el.height) ? el.height : 0
  return {
    minX: el.x,
    minY: el.y,
    maxX: el.x + w,
    maxY: el.y + h,
  }
}

function worldBounds(
  elements: readonly WhiteboardMinimapElement[],
  viewport: WhiteboardMinimapViewport,
): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const el of elements) {
    if (el.isDeleted) continue
    const b = elementBounds(el)
    if (!Number.isFinite(b.minX) || !Number.isFinite(b.minY)) continue
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }

  const { scrollX, scrollY, zoom, width, height } = viewport
  const z = Math.max(zoom, 1e-6)
  const vx0 = -scrollX / z
  const vy0 = -scrollY / z
  const vx1 = vx0 + width / z
  const vy1 = vy0 + height / z
  minX = Math.min(minX, vx0)
  minY = Math.min(minY, vy0)
  maxX = Math.max(maxX, vx1)
  maxY = Math.max(maxY, vy1)

  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 400
    maxY = 300
  }

  const dx = maxX - minX || 1
  const dy = maxY - minY || 1
  const scale = Math.min((MAP_W - MAP_PAD * 2) / dx, (MAP_H - MAP_PAD * 2) / dy)
  return { minX, minY, maxX, maxY, scale }
}

function toMap(x: number, y: number, b: Bounds): [number, number] {
  return [MAP_PAD + (x - b.minX) * b.scale, MAP_PAD + (y - b.minY) * b.scale]
}

function fromMap(mx: number, my: number, b: Bounds): [number, number] {
  return [(mx - MAP_PAD) / b.scale + b.minX, (my - MAP_PAD) / b.scale + b.minY]
}

function scrollForWorldCenter(
  wx: number,
  wy: number,
  viewport: WhiteboardMinimapViewport,
): { scrollX: number; scrollY: number } {
  const z = Math.max(viewport.zoom, 1e-6)
  return {
    scrollX: viewport.width / 2 - wx * z,
    scrollY: viewport.height / 2 - wy * z,
  }
}

export function createWhiteboardMinimap(
  container: HTMLElement,
  onPan: (scrollX: number, scrollY: number) => void,
): WhiteboardMinimapHandle {
  const canvas = container.appendChild(document.createElement("canvas"))
  const dpr = window.devicePixelRatio || 1
  canvas.width = MAP_W * dpr
  canvas.height = MAP_H * dpr
  canvas.className = "whiteboard-minimap"
  canvas.setAttribute("aria-label", "Whiteboard minimap")
  canvas.style.width = `${MAP_W}px`
  canvas.style.height = `${MAP_H}px`

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return { update: () => {}, reveal: () => {}, destroy: () => canvas.remove() }
  }
  ctx.scale(dpr, dpr)

  let latestElements: readonly WhiteboardMinimapElement[] = []
  let latestViewport: WhiteboardMinimapViewport = {
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    width: 1,
    height: 1,
  }
  let boundsCache: Bounds = worldBounds([], latestViewport)
  let raf = 0
  let dragging = false
  let hovered = false
  let visible = false
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  const setVisible = (next: boolean) => {
    if (next === visible) return
    visible = next
    canvas.classList.toggle("whiteboard-minimap--visible", next)
  }

  const scheduleHide = () => {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      if (!hovered && !dragging) setVisible(false)
    }, MINIMAP_HIDE_MS)
  }

  const reveal = () => {
    setVisible(true)
    scheduleHide()
  }

  const resolveDotColor = () => {
    const raw = getComputedStyle(container).getPropertyValue("--text-interactive-base").trim()
    return raw || "#6b8afd"
  }

  let dotColor = resolveDotColor()

  const paint = () => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      dotColor = resolveDotColor()
      boundsCache = worldBounds(latestElements, latestViewport)
      const b = boundsCache
      ctx.clearRect(0, 0, MAP_W, MAP_H)

      ctx.globalAlpha = 0.85
      ctx.fillStyle = dotColor
      for (const el of latestElements) {
        if (el.isDeleted) continue
        const box = elementBounds(el)
        const [x0, y0] = toMap(box.minX, box.minY, b)
        const [x1, y1] = toMap(box.maxX, box.maxY, b)
        const w = Math.max(1.5, x1 - x0)
        const h = Math.max(1.5, y1 - y0)
        ctx.fillRect(x0, y0, w, h)
      }

      const z = Math.max(latestViewport.zoom, 1e-6)
      const vx0 = -latestViewport.scrollX / z
      const vy0 = -latestViewport.scrollY / z
      const vw = latestViewport.width / z
      const vh = latestViewport.height / z
      const [rx, ry] = toMap(vx0, vy0, b)
      const rw = vw * b.scale
      const rh = vh * b.scale

      ctx.globalAlpha = 1
      ctx.fillStyle = "rgba(0,0,0,0.45)"
      const mask = new Path2D()
      mask.rect(0, 0, MAP_W, MAP_H)
      mask.rect(rx, ry, rw, rh)
      ctx.fill(mask, "evenodd")

      ctx.strokeStyle = "rgba(255,255,255,0.9)"
      ctx.lineWidth = 1
      ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(0, rw - 1), Math.max(0, rh - 1))
    })
  }

  const panToEvent = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const [wx, wy] = fromMap(mx, my, boundsCache)
    const next = scrollForWorldCenter(wx, wy, latestViewport)
    onPan(next.scrollX, next.scrollY)
  }

  const onDown = (e: MouseEvent) => {
    e.preventDefault()
    dragging = true
    reveal()
    panToEvent(e)
  }
  const onMove = (e: MouseEvent) => {
    if (!dragging) return
    panToEvent(e)
  }
  const onUp = () => {
    if (!dragging) return
    dragging = false
    scheduleHide()
  }
  const onEnter = () => {
    hovered = true
    if (hideTimer) clearTimeout(hideTimer)
    setVisible(true)
  }
  const onLeave = () => {
    hovered = false
    scheduleHide()
  }

  canvas.addEventListener("mousedown", onDown)
  canvas.addEventListener("mouseenter", onEnter)
  canvas.addEventListener("mouseleave", onLeave)
  window.addEventListener("mousemove", onMove)
  window.addEventListener("mouseup", onUp)

  return {
    update({ elements, viewport }) {
      latestElements = elements
      latestViewport = viewport
      paint()
    },
    reveal,
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      if (hideTimer) clearTimeout(hideTimer)
      canvas.removeEventListener("mousedown", onDown)
      canvas.removeEventListener("mouseenter", onEnter)
      canvas.removeEventListener("mouseleave", onLeave)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      canvas.remove()
    },
  }
}

export const WHITEBOARD_MINIMAP_HEIGHT = MAP_H
