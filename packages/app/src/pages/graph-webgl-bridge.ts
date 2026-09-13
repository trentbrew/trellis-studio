// WebGL graph renderer bridge — adapts mountGraphWebGL to the shared RenderHandle contract.

import {
  DEFAULT_PHYSICS,
  IconCache,
  NODE_ICON_STROKE,
  nodeColor,
  type GraphCallbacks,
  type Physics,
  type RenderHandle,
  type SimNode,
} from "./graph-shared"
import { mountGraphWebGL, type WebGLNode, type WebGLLink } from "./graph-webgl"
import type { TrellisGraphEdge } from "@/context/trellis"

type LinkInput = Omit<TrellisGraphEdge, "source" | "target"> & { source: string; target: string }

function iconKey(n: SimNode): string {
  return n.icon ? `${n.type}|${n.icon}` : n.type
}

export function renderWebgl(
  svgEl: SVGSVGElement,
  nodes: SimNode[],
  links: LinkInput[],
  cb: GraphCallbacks,
  physics: Physics = DEFAULT_PHYSICS,
): RenderHandle {
  const container = svgEl.parentElement
  if (!container) throw new Error("graph-webgl: svgEl must be in a container")

  const host = document.createElement("div")
  host.className = "graph-webgl"
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;z-index:1;"
  container.insertBefore(host, svgEl)

  const savedSvgStyle = {
    display: svgEl.style.display,
    pointerEvents: svgEl.style.pointerEvents,
    position: svgEl.style.position,
    inset: svgEl.style.inset,
    zIndex: svgEl.style.zIndex,
  }
  svgEl.style.display = "none"
  svgEl.style.pointerEvents = "none"

  const dpr = window.devicePixelRatio || 1
  const iconCache = new IconCache(dpr)
  const iconMeta = new Map<string, { type: string; icon?: string }>()
  for (const n of nodes) iconMeta.set(iconKey(n), { type: n.type, icon: n.icon })

  const webglNodes: WebGLNode[] = nodes.map((n) => {
    const key = iconKey(n)
    return {
      id: n.id,
      title: n.label,
      nodeType: n.type,
      color: nodeColor(n),
      icon: key,
      raw: n,
      x: n.x ?? undefined,
      y: n.y ?? undefined,
    }
  })

  const webglLinks: WebGLLink[] = links.map((l, i) => ({
    id: `${l.source}-${l.target}-${i}`,
    source: l.source,
    target: l.target,
    label: l.type,
  }))

  let handle: ReturnType<typeof mountGraphWebGL> | undefined

  handle = mountGraphWebGL(host, webglNodes, webglLinks, {
    onSelect: (n) => cb.onSelect(n.raw as SimNode),
    onDeselect: () => cb.onDeselect(),
    getIconCanvas: async (key, _color, sizePx) => {
      const meta = iconMeta.get(key)
      if (!meta) return null
      const px = Math.max(4, Math.round(sizePx))
      return iconCache.entity(meta.type, "#ffffff", px, NODE_ICON_STROKE, meta.icon)
    },
  })

  const stop = () => {
    handle?.stop()
    handle = undefined
    host.remove()
    svgEl.style.display = savedSvgStyle.display
    svgEl.style.pointerEvents = savedSvgStyle.pointerEvents
    svgEl.style.position = savedSvgStyle.position
    svgEl.style.inset = savedSvgStyle.inset
    svgEl.style.zIndex = savedSvgStyle.zIndex
    iconCache.clear()
  }

  return {
    stop,
    focus: (id) => handle?.focus(id),
    fit: () => handle?.fit(),
    recenter: () => handle?.fit(),
    goToNodesIfOffscreen: () => {
      handle?.fit()
      return true
    },
    setHoveredId: (id) => handle?.setHoveredId(id),
    setPhysics: (p: Physics) => handle?.setPhysics(p.dist, p.charge),
    patch: () => {},
  }
}
