// 3D / WebGL renderer for GraphView.
//
// Celestial orb nodes, depth-aware edges, selection orbit, and orbit/pan controls.

import ForceGraph3D from "3d-force-graph"
import * as THREE from "three"
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js"

export type WebGLNode = {
  id: string
  title: string
  nodeType: string
  color: string
  icon: string
  raw: unknown
  x?: number
  y?: number
  z?: number
}

export type WebGLLink = {
  id: string
  source: string
  target: string
  label?: string
  dashed?: boolean
}

export type WebGLCallbacks = {
  onSelect?: (n: WebGLNode) => void
  onHover?: (n: WebGLNode | null) => void
  onDeselect?: () => void
  getIconCanvas: (iconName: string, color: string, sizePx: number) => Promise<HTMLCanvasElement | null>
  bgColor?: string
}

export type WebGLHandle = {
  stop: () => void
  focus: (id: string | null) => void
  setHoveredId: (id: string | null) => void
  clearSelection: () => void
  fit: () => void
  setPhysics: (dist: number, charge: number) => void
}

const _cam = new THREE.Vector3()
const _nodePos = new THREE.Vector3()
const _mid = new THREE.Vector3()

function truncateTitle(title: string, max = 22): string {
  const t = title.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function nodeOpacityForDistance(dist: number, near: number, far: number, closeNear: number): number {
  let opacity: number
  if (dist <= near) opacity = 0.96
  else if (dist >= far) opacity = 0.1
  else {
    const t = (dist - near) / (far - near)
    opacity = 0.96 - t * 0.86
  }
  if (dist < closeNear) {
    const t = dist / closeNear
    opacity *= 0.28 + 0.72 * t
  }
  return opacity
}

function linkEndpoint(l: { source?: unknown; target?: unknown }, side: "source" | "target"): WebGLNode | null {
  const v = l[side]
  if (v && typeof v === "object" && "id" in v && typeof (v as WebGLNode).id === "string") return v as WebGLNode
  return null
}

export function mountGraphWebGL(
  container: HTMLElement,
  nodes: WebGLNode[],
  links: WebGLLink[],
  cb: WebGLCallbacks,
): WebGLHandle {
  const byId = new Map<string, WebGLNode>()
  for (const n of nodes) byId.set(n.id, n)

  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n.id, new Set())
  for (const l of links) {
    adj.get(l.source)?.add(l.target)
    adj.get(l.target)?.add(l.source)
  }

  const meshById = new Map<string, THREE.Mesh>()
  const glowById = new Map<string, THREE.Mesh>()
  const spriteById = new Map<string, THREE.Sprite>()
  const labelById = new Map<string, CSS2DObject>()
  const baseColorById = new Map<string, THREE.Color>()
  const disposables: Array<{ dispose: () => void }> = []

  const size = nodes.length
  const depthNear = size > 1200 ? 80 : 60
  const depthFar = size > 2000 ? 900 : size > 500 ? 650 : 420
  const closeNear = size > 1200 ? 48 : 36
  const labelMaxDist = size > 1200 ? 280 : 200
  const baseLinkWidth = size > 1200 ? 0.75 : 1.1
  const orbitRadius = size > 1200 ? 165 : 130

  let hoveredId: string | null = null
  let selectedId: string | null = null
  let orbitActive = false
  let flyToTimer: ReturnType<typeof setTimeout> | null = null
  let lastTinted: string | null = null

  const focusSet = new Set<string>()

  function rebuildFocusSet() {
    focusSet.clear()
    if (!selectedId) return
    focusSet.add(selectedId)
    const nb = adj.get(selectedId)
    if (nb) for (const id of nb) focusSet.add(id)
  }

  function stopAutoOrbit() {
    orbitActive = false
    if (controls) controls.autoRotate = false
  }

  function startAutoOrbit() {
    if (!controls) return
    syncOrbitTarget()
    orbitActive = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.75
  }

  function syncOrbitTarget() {
    if (!controls || !selectedId) return
    const n = byId.get(selectedId)
    if (!n) return
    controls.target.set(n.x ?? 0, n.y ?? 0, n.z ?? 0)
  }

  function scheduleAutoOrbitAfterFlyTo(n: WebGLNode) {
    if (flyToTimer) clearTimeout(flyToTimer)
    flyToTimer = setTimeout(() => {
      flyToTimer = null
      if (selectedId === n.id) startAutoOrbit()
    }, 950)
  }

  function linkInClosure(l: { source?: unknown; target?: unknown }): boolean {
    const focus = hoveredId || selectedId
    if (!focus) return false
    const s = typeof l.source === "object" && l.source && "id" in l.source ? (l.source as WebGLNode).id : l.source
    const t = typeof l.target === "object" && l.target && "id" in l.target ? (l.target as WebGLNode).id : l.target
    return s === focus || t === focus
  }

  function focusDim(id: string): number {
    if (!selectedId) return 1
    if (focusSet.has(id)) return id === selectedId ? 1 : 0.78
    return 0.09
  }

  function linkMidDistance(l: { source?: unknown; target?: unknown }): number {
    const s = linkEndpoint(l, "source")
    const t = linkEndpoint(l, "target")
    if (!s || !t) return depthFar
    _mid.set(((s.x ?? 0) + (t.x ?? 0)) / 2, ((s.y ?? 0) + (t.y ?? 0)) / 2, ((s.z ?? 0) + (t.z ?? 0)) / 2)
    return _cam.distanceTo(_mid)
  }

  function linkDepthStyle(l: { source?: unknown; target?: unknown }): { color: string; opacity: number } {
    const dist = linkMidDistance(l)
    const t = clamp01((dist - depthNear) / (depthFar - depthNear))
    const nearOpacity = 0.22
    const farOpacity = 0.035
    const opacity = nearOpacity - t * (nearOpacity - farOpacity)

    if (linkInClosure(l)) {
      return { color: "rgb(180, 195, 220)", opacity: Math.min(0.55, opacity + 0.2) }
    }
    if (selectedId && !linkInClosure(l)) {
      return { color: "rgb(70, 78, 95)", opacity: opacity * 0.12 }
    }
    const r = Math.round(72 + t * 28)
    const g = Math.round(82 + t * 24)
    const b = Math.round(102 + t * 20)
    return { color: `rgb(${r}, ${g}, ${b})`, opacity }
  }

  function linkWidthFn(l: { source?: unknown; target?: unknown }): number {
    const dist = linkMidDistance(l)
    const t = clamp01((dist - depthNear) / (depthFar - depthNear))
    const width = baseLinkWidth * (1.15 - t * 0.55)
    if (linkInClosure(l)) return width * 2.4
    if (selectedId) return width * 0.35
    return width
  }

  function nodeRadius(n: WebGLNode): number {
    const t = n.nodeType
    if (t === "issue") return 14
    if (t === "project") return 12
    if (t === "epic") return 10
    if (t === "task") return 9
    if (t === "person") return 9
    if (t === "directory") return 8
    if (t === "file") return 7
    if (t === "op") return 4
    return 8
  }

  function buildNodeObject(n: WebGLNode): THREE.Object3D {
    const r = nodeRadius(n)
    const color = new THREE.Color(n.color || "#8b5cf6")
    const group = new THREE.Group()
    group.renderOrder = 10

    const glowGeom = new THREE.SphereGeometry(r * 1.85, 18, 14)
    const glowMat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const glow = new THREE.Mesh(glowGeom, glowMat)
    glow.renderOrder = 9
    group.add(glow)
    glowById.set(n.id, glow)
    disposables.push(glowGeom, glowMat)

    const coreGeom = new THREE.SphereGeometry(r, 28, 20)
    const coreMat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.88,
      fog: false,
    })
    const core = new THREE.Mesh(coreGeom, coreMat)
    core.renderOrder = 10
    group.add(core)
    meshById.set(n.id, core)
    baseColorById.set(n.id, color.clone())
    disposables.push(coreGeom, coreMat)

    const haloGeom = new THREE.SphereGeometry(r * 1.25, 16, 12)
    const haloMat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const halo = new THREE.Mesh(haloGeom, haloMat)
    halo.renderOrder = 10
    group.add(halo)
    disposables.push(haloGeom, haloMat)

    const labelEl = document.createElement("div")
    labelEl.className = "gv-webgl-label"
    labelEl.textContent = truncateTitle(n.title)
    const label = new CSS2DObject(labelEl)
    label.position.set(0, r + 12, 0)
    label.visible = false
    group.add(label)
    labelById.set(n.id, label)

    const iconPx = Math.max(24, Math.round(r * 4))
    cb.getIconCanvas(n.icon || "entity", "#ffffff", iconPx)
      .then((canvas) => {
        if (!canvas) return
        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        const spriteMat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity: 0.92,
          depthTest: false,
          fog: false,
        })
        const sprite = new THREE.Sprite(spriteMat)
        sprite.renderOrder = 11
        const s = r * 1.15
        sprite.scale.set(s, s, 1)
        sprite.position.set(0, 0, r * 0.08)
        group.add(sprite)
        spriteById.set(n.id, sprite)
        disposables.push(tex, spriteMat)
      })
      .catch(() => {})

    return group
  }

  function applyNodeTint(id: string | null) {
    if (lastTinted && lastTinted !== id) {
      const base = baseColorById.get(lastTinted)
      const m = meshById.get(lastTinted)
      const g = glowById.get(lastTinted)
      if (base && m) (m.material as THREE.MeshBasicMaterial).color.copy(base)
      if (base && g) (g.material as THREE.MeshBasicMaterial).color.copy(base)
    }
    if (id) {
      const base = baseColorById.get(id)
      const m = meshById.get(id)
      const g = glowById.get(id)
      if (base && m) {
        const bright = base.clone().multiplyScalar(1.45)
        ;(m.material as THREE.MeshBasicMaterial).color.copy(bright)
      }
      if (base && g) {
        const bloom = base.clone().multiplyScalar(1.2)
        ;(g.material as THREE.MeshBasicMaterial).color.copy(bloom)
      }
    }
    lastTinted = id
  }

  function refreshLinks() {
    fg.linkWidth(linkWidthFn)
    updateLinkVisuals()
    patchLinkMeshes()
  }

  function linkMaterialFor(l: { source?: unknown; target?: unknown }): THREE.MeshBasicMaterial {
    const style = linkDepthStyle(l)
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setStyle(style.color),
      transparent: true,
      opacity: style.opacity,
      depthWrite: false,
      depthTest: true,
    })
    disposables.push(mat)
    return mat
  }

  function updateLinkVisuals() {
    scene.traverse((obj: THREE.Object3D & { __graphObjType?: string; __data?: unknown }) => {
      if (obj.__graphObjType !== "link") return
      const style = linkDepthStyle(obj.__data ?? {})
      const mesh = obj as THREE.Mesh
      const mat = mesh.material as THREE.MeshBasicMaterial
      if (!mat?.isMeshBasicMaterial) return
      mat.color.setStyle(style.color)
      mat.opacity = style.opacity
    })
  }

  function patchLinkMeshes() {
    scene.traverse((obj: THREE.Object3D & { __graphObjType?: string }) => {
      if (obj.__graphObjType !== "link") return
      obj.renderOrder = 0
      const mesh = obj as THREE.Mesh
      const mat = mesh.material
      if (mat && !Array.isArray(mat)) {
        mat.depthWrite = false
        mat.transparent = true
      }
    })
  }

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.domElement.style.position = "absolute"
  labelRenderer.domElement.style.inset = "0"
  labelRenderer.domElement.style.pointerEvents = "none"
  labelRenderer.domElement.style.zIndex = "2"
  container.appendChild(labelRenderer.domElement)

  const fg = new ForceGraph3D(container, { controlType: "orbit" })
    .backgroundColor("rgba(0,0,0,0)")
    .showNavInfo(false)
    .nodeRelSize(1)
    .nodeOpacity(1)
    .enableNodeDrag(false)
    .nodeThreeObject(((n: WebGLNode) => buildNodeObject(n)) as (node: object) => THREE.Object3D)
    .nodeThreeObjectExtend(false)
    .linkWidth(linkWidthFn)
    .linkMaterial((link: object) => linkMaterialFor(link as { source?: unknown; target?: unknown }))
    .linkDirectionalParticles(0)
    .onNodeHover((n) => onHover(n as WebGLNode | null))
    .onNodeClick((n) => onClick(n as WebGLNode))
    .onBackgroundClick(() => clearSelection())

  const controls = fg.controls() as {
    autoRotate?: boolean
    autoRotateSpeed?: number
    target: THREE.Vector3
    enabled?: boolean
    enableZoom?: boolean
    enableRotate?: boolean
    rotateSpeed?: number
    mouseButtons?: Record<string, number>
    touches?: Record<string, number>
    addEventListener?: (type: string, fn: () => void) => void
    update?: () => void
    _rotateLeft?: (angle: number) => void
    _rotateUp?: (angle: number) => void
  } | null
  let removeWheelHandler: (() => void) | null = null
  let removeGestureHandlers: (() => void) | null = null

  function dollyCamera(deltaY: number) {
    const camera = fg.camera() as THREE.PerspectiveCamera
    const target = controls?.target as THREE.Vector3
    const offset = new THREE.Vector3().copy(camera.position).sub(target)
    const dist = offset.length()
    if (dist < 1) return
    const speed = 0.95
    const factor = Math.exp(deltaY * 0.0028 * speed)
    const newDist = Math.max(2, Math.min(4000, dist * factor))
    offset.setLength(newDist)
    camera.position.copy(target).add(offset)
    camera.updateProjectionMatrix()
    controls?.update?.()
  }

  if (controls) {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.ROTATE,
    }
    controls.rotateSpeed = -(Math.abs(controls.rotateSpeed ?? 1))
    controls.enableZoom = false

    const dom = fg.renderer().domElement as HTMLElement
    const twoPi = Math.PI * 2

    const onWheel = (event: WheelEvent) => {
      if (!controls.enabled) return
      event.preventDefault()
      event.stopPropagation()
      stopAutoOrbit()

      const isPinchZoom = event.ctrlKey || event.metaKey

      if (isPinchZoom) {
        dollyCamera(event.deltaY)
        return
      }

      if (!controls.enableRotate) return
      const speed = controls.rotateSpeed ?? -1
      const factor = (twoPi * speed) / (dom.clientHeight || 600)
      if (event.deltaX) controls._rotateLeft?.(event.deltaX * factor)
      if (event.deltaY) controls._rotateUp?.(event.deltaY * factor)
      controls.update?.()
    }

    dom.addEventListener("wheel", onWheel, { passive: false, capture: true })
    removeWheelHandler = () => dom.removeEventListener("wheel", onWheel, { capture: true })

    let gestureScale = 1
    const onGestureStart = (e: Event & { scale?: number }) => {
      if (!controls.enabled) return
      e.preventDefault()
      stopAutoOrbit()
      gestureScale = e.scale ?? 1
    }
    const onGestureChange = (e: Event & { scale?: number; clientX?: number; clientY?: number }) => {
      if (!controls.enabled) return
      e.preventDefault()
      stopAutoOrbit()
      const scale = e.scale ?? 1
      const delta = (scale - gestureScale) * 200
      gestureScale = scale
      dollyCamera(delta)
    }
    const onGestureEnd = () => {
      gestureScale = 1
    }
    dom.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false, capture: true })
    dom.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false, capture: true })
    dom.addEventListener("gestureend", onGestureEnd as EventListener, { passive: false, capture: true })
    removeGestureHandlers = () => {
      dom.removeEventListener("gesturestart", onGestureStart as EventListener, { capture: true })
      dom.removeEventListener("gesturechange", onGestureChange as EventListener, { capture: true })
      dom.removeEventListener("gestureend", onGestureEnd as EventListener, { capture: true })
    }

    controls.addEventListener?.("start", () => {
      stopAutoOrbit()
    })
  }

  let baseDist = size > 2200 ? 30 : size > 1200 ? 50 : 80
  let baseCharge = size > 2200 ? -90 : size > 1200 ? -130 : -250

  const charge = fg.d3Force("charge") as { strength?: (v: number) => unknown; distanceMax?: (v: number) => unknown } | undefined
  charge?.strength?.(baseCharge)
  charge?.distanceMax?.(600)
  const linkForce = fg.d3Force("link") as { distance?: (v: number) => unknown; strength?: (v: number) => unknown } | undefined
  linkForce?.distance?.(baseDist)
  linkForce?.strength?.(0.4)

  fg.graphData({ nodes: nodes as object[], links: links as object[] })

  const scene = fg.scene()
  requestAnimationFrame(() => patchLinkMeshes())

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth
    const h = container.clientHeight
    fg.width(w).height(h)
    labelRenderer.setSize(w, h)
  })
  ro.observe(container)
  const initW = container.clientWidth
  const initH = container.clientHeight
  fg.width(initW).height(initH)
  labelRenderer.setSize(initW, initH)

  function updateSceneVisuals() {
    const camera = fg.camera()
    _cam.copy(camera.position)

    for (const n of nodes) {
      _nodePos.set(n.x ?? 0, n.y ?? 0, n.z ?? 0)
      const dist = _cam.distanceTo(_nodePos)
      let opacity = nodeOpacityForDistance(dist, depthNear, depthFar, closeNear)
      opacity *= focusDim(n.id)

      const isHot = n.id === hoveredId || n.id === selectedId
      if (isHot) opacity = Math.min(1, opacity + 0.12)

      const mesh = meshById.get(n.id)
      if (mesh) (mesh.material as THREE.MeshBasicMaterial).opacity = opacity

      const glow = glowById.get(n.id)
      if (glow) {
        const glowOp = isHot ? Math.min(0.55, opacity * 0.45) : opacity * 0.32
        ;(glow.material as THREE.MeshBasicMaterial).opacity = glowOp
        const closeBoost = dist < closeNear ? 1 + (1 - dist / closeNear) * 0.35 : 1
        glow.scale.setScalar(closeBoost)
      }

      const sprite = spriteById.get(n.id)
      if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = opacity * 0.95

      const label = labelById.get(n.id)
      if (label) {
        const showLabel =
          (selectedId === n.id || (dist < labelMaxDist && opacity > 0.4)) && opacity > 0.15
        label.visible = showLabel
        label.element.style.opacity = String(Math.min(1, opacity + 0.2))
      }
    }

    if (orbitActive && selectedId) syncOrbitTarget()

    refreshLinks()
    labelRenderer.render(scene, camera)
  }

  fg.onEngineTick(updateSceneVisuals)

  function onHover(n: WebGLNode | null) {
    const id = n?.id ?? null
    if (id === hoveredId) return
    hoveredId = id
    applyNodeTint(selectedId || id)
    refreshLinks()
    container.style.cursor = id ? "pointer" : "default"
    cb.onHover?.(n)
  }

  function beginOrbit(n: WebGLNode) {
    selectedId = n.id
    rebuildFocusSet()
    stopAutoOrbit()
    applyNodeTint(n.id)
    refreshLinks()
    syncOrbitTarget()
  }

  function clearSelection() {
    selectedId = null
    stopAutoOrbit()
    if (flyToTimer) {
      clearTimeout(flyToTimer)
      flyToTimer = null
    }
    focusSet.clear()
    applyNodeTint(hoveredId)
    refreshLinks()
    cb.onDeselect?.()
  }

  function onClick(n: WebGLNode) {
    cb.onSelect?.(n)
    beginOrbit(n)
    flyTo(n)
    scheduleAutoOrbitAfterFlyTo(n)
  }

  function flyTo(n: WebGLNode) {
    const x = n.x ?? 0
    const y = n.y ?? 0
    const z = n.z ?? 0
    fg.cameraPosition(
      { x: x + orbitRadius * 0.6, y: y + orbitRadius * 0.25, z: z + orbitRadius * 0.85 },
      { x, y, z },
      900,
    )
  }

  function clusterCenter(): { x: number; y: number; z: number } {
    if (nodes.length === 0) return { x: 0, y: 0, z: 0 }
    let x = 0
    let y = 0
    let z = 0
    for (const n of nodes) {
      x += n.x ?? 0
      y += n.y ?? 0
      z += n.z ?? 0
    }
    const inv = 1 / nodes.length
    return { x: x * inv, y: y * inv, z: z * inv }
  }

  function fit() {
    const c = clusterCenter()
    const dist = size > 1200 ? 420 : size > 500 ? 320 : 240
    fg.cameraPosition(
      { x: c.x + dist * 0.35, y: c.y + dist * 0.2, z: c.z + dist * 0.75 },
      c,
      800,
    )
  }

  function focus(id: string | null) {
    if (!id) {
      clearSelection()
      return
    }
    const n = byId.get(id)
    if (n) {
      beginOrbit(n)
      flyTo(n)
      scheduleAutoOrbitAfterFlyTo(n)
    }
  }

  function setHoveredId(id: string | null) {
    if (id && !byId.has(id)) return
    if (id === hoveredId) return
    hoveredId = id
    applyNodeTint(selectedId || id)
    refreshLinks()
  }

  function setPhysics(distMul: number, chargeMul: number) {
    baseDist = (size > 2200 ? 30 : size > 1200 ? 50 : 80) * distMul
    baseCharge = (size > 2200 ? -90 : size > 1200 ? -130 : -250) * chargeMul
    charge?.strength?.(baseCharge)
    linkForce?.distance?.(baseDist)
  }

  function stop() {
    ro.disconnect()
    if (flyToTimer) {
      clearTimeout(flyToTimer)
      flyToTimer = null
    }
    stopAutoOrbit()
    removeWheelHandler?.()
    removeWheelHandler = null
    removeGestureHandlers?.()
    removeGestureHandlers = null
    ;(fg as { _destructor?: () => void })._destructor?.()
    labelRenderer.domElement.remove()
    for (const d of disposables) {
      try {
        d.dispose()
      } catch {}
    }
    disposables.length = 0
    meshById.clear()
    glowById.clear()
    spriteById.clear()
    labelById.clear()
    baseColorById.clear()
    while (container.firstChild) container.removeChild(container.firstChild)
  }

  requestAnimationFrame(() => fit())

  return { stop, focus, setHoveredId, clearSelection, fit, setPhysics }
}
