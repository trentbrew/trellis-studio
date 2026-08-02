import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"
import { useSDK } from "@/context/sdk"
import { media } from "./media"

type Pack = {
  obj: THREE.Object3D
  clips: THREE.AnimationClip[]
  flat?: boolean
  info?: string
}

const ext = (file: string) => file.split("?")[0]!.split("#")[0]!.split(".").pop()?.toLowerCase() ?? ""
const dir = (file: string) => file.replaceAll("\\", "/").split("/").slice(0, -1).join("/")
const name = (file: string) => file.replaceAll("\\", "/").split("/").pop() ?? file
const model = (file: string) => /\.(?:obj|mtl|gltf|glb|bin|dds)$/i.test(file)

const text = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`
const four = (value: string) =>
  value.charCodeAt(0) | (value.charCodeAt(1) << 8) | (value.charCodeAt(2) << 16) | (value.charCodeAt(3) << 24)

const decode = (value: string) => {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

const join = (base: string, ref: string) => {
  const value = decode(ref.replaceAll("\\", "/").split("#")[0]!.split("?")[0] ?? ref)
  if (!value) return base
  if (/^(?:[a-z]+:|\/\/)/i.test(value)) return value
  if (value.startsWith("/file/raw")) return value
  if (value.startsWith("/")) return value.slice(1)
  const out = dir(base).split("/").filter(Boolean)
  for (const part of value.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join("/")
}

function disposable(value: unknown): value is { dispose: VoidFunction } {
  return !!value && typeof value === "object" && "dispose" in value && typeof value.dispose === "function"
}

function disposeMaterial(mat: THREE.Material) {
  for (const value of Object.values(mat)) {
    if (value instanceof THREE.Texture) value.dispose()
  }
  mat.dispose()
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (disposable(child.geometry)) child.geometry.dispose()
    if (Array.isArray(child.material)) child.material.forEach(disposeMaterial)
    if (child.material instanceof THREE.Material) disposeMaterial(child.material)
  })
}

function dds(buffer: ArrayBuffer) {
  const header = new Int32Array(buffer, 0, 31)
  if (header[0] !== four("DDS ")) throw new Error("Invalid DDS texture")
  const width = Math.max(header[4] ?? 0, 1)
  const height = Math.max(header[3] ?? 0, 1)
  const mipmaps = Math.max(header[2]! & 0x20000 ? header[7]! : 1, 1)
  const code = header[21]
  const dx10 = code === four("DX10") ? new Int32Array(buffer, 128, 5)[0] : undefined
  const spec: { block: number; format: THREE.CompressedPixelFormat; label: string } | undefined =
    code === four("DXT1")
      ? { block: 8, format: THREE.RGB_S3TC_DXT1_Format, label: "DXT1" }
      : code === four("DXT3")
        ? { block: 16, format: THREE.RGBA_S3TC_DXT3_Format, label: "DXT3" }
        : code === four("DXT5")
          ? { block: 16, format: THREE.RGBA_S3TC_DXT5_Format, label: "DXT5" }
          : code === four("ETC1")
            ? { block: 8, format: THREE.RGB_ETC1_Format, label: "ETC1" }
            : dx10 === 95
              ? { block: 16, format: THREE.RGB_BPTC_UNSIGNED_Format, label: "BC6H" }
              : dx10 === 96
                ? { block: 16, format: THREE.RGB_BPTC_SIGNED_Format, label: "BC6H" }
                : dx10 === 98
                  ? { block: 16, format: THREE.RGBA_BPTC_Format, label: "BC7" }
                  : undefined
  if (spec) {
    const maps: THREE.CompressedTextureMipmap[] = []
    let offset = header[1]! + 4 + (code === four("DX10") ? 20 : 0)
    let w = width
    let h = height
    for (let i = 0; i < mipmaps; i++) {
      const size = Math.ceil(w / 4) * Math.ceil(h / 4) * spec.block
      maps.push({ data: new Uint8Array(buffer, offset, size), width: w, height: h })
      offset += size
      w = Math.max(w >> 1, 1)
      h = Math.max(h >> 1, 1)
    }
    const tex = new THREE.CompressedTexture(maps, width, height, spec.format)
    if (maps.length === 1) tex.minFilter = THREE.LinearFilter
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return { tex, width, height, label: spec.label, mipmaps: maps.length }
  }
  if (
    header[22] === 32 &&
    header[23]! & 0xff0000 &&
    header[24]! & 0xff00 &&
    header[25]! & 0xff &&
    header[26]! & 0xff000000
  ) {
    const data = new Uint8Array(width * height * 4)
    const raw = new Uint8Array(buffer, header[1]! + 4, data.length)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = raw[i * 4 + 2]!
      data[i * 4 + 1] = raw[i * 4 + 1]!
      data[i * 4 + 2] = raw[i * 4]!
      data[i * 4 + 3] = raw[i * 4 + 3]!
    }
    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return { tex, width, height, label: "RGBA", mipmaps: 1 }
  }
  throw new Error(dx10 ? `Unsupported DDS DXGI format ${dx10}` : "Unsupported DDS texture format")
}

export function ModelViewer(props: { active: boolean; path: string }) {
  const sdk = useSDK()
  const [state, set] = createStore({
    error: undefined as string | undefined,
    info: "",
    loading: true,
  })
  const kind = createMemo(() => ext(props.path).toUpperCase())
  const title = createMemo(() => name(props.path))
  let root: HTMLDivElement | undefined
  let renderer: THREE.WebGLRenderer | undefined
  let scene: THREE.Scene | undefined
  let camera: THREE.PerspectiveCamera | undefined
  let controls: OrbitControls | undefined
  let current: THREE.Object3D | undefined
  let draco: DRACOLoader | undefined
  let flat = false
  let grid: THREE.GridHelper | undefined
  let mixer: THREE.AnimationMixer | undefined
  let resize: ResizeObserver | undefined
  let frame = 0
  let seq = 0
  const clock = new THREE.Clock()

  const target = () => (ext(props.path) === "bin" ? props.path.replace(/\.bin$/i, ".gltf") : props.path)
  const url = (file: string) => media(sdk.url, file, sdk.directory)
  const asset = (base: string, raw: string) => {
    if (/^(?:https?|data|blob):/i.test(raw)) return raw
    if (raw.startsWith("/file/raw")) return new URL(raw, sdk.url).toString()
    return url(join(base, raw))
  }

  const stats = (obj: THREE.Object3D, clips: THREE.AnimationClip[]) => {
    let meshes = 0
    let tris = 0
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      meshes++
      if (child.geometry.index) tris += child.geometry.index.count / 3
      const pos = child.geometry.attributes.position
      if (!child.geometry.index && pos) tris += pos.count / 3
    })
    const parts = [text(meshes, "mesh"), text(Math.round(tris), "triangle")]
    if (clips.length) parts.push(text(clips.length, "animation"))
    return parts.join(" · ")
  }

  const draw = () => {
    if (!renderer || !scene || !camera) return
    mixer?.update(clock.getDelta())
    controls?.update()
    renderer.render(scene, camera)
  }

  const start = () => {
    if (frame) return
    const tick = () => {
      frame = requestAnimationFrame(tick)
      draw()
    }
    clock.start()
    tick()
  }

  const stop = () => {
    if (!frame) return
    cancelAnimationFrame(frame)
    frame = 0
    clock.stop()
  }

  const size = () => {
    if (!root || !renderer || !camera) return
    const width = Math.max(root.clientWidth, 1)
    const height = Math.max(root.clientHeight, 1)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    draw()
  }

  const frameModel = (obj = current) => {
    if (!obj || !camera || !controls) return
    const box = new THREE.Box3().setFromObject(obj)
    const center = new THREE.Vector3()
    const scale = new THREE.Vector3()
    if (box.isEmpty()) {
      center.set(0, 0, 0)
      scale.set(2, 2, 2)
    } else {
      box.getCenter(center)
      box.getSize(scale)
    }
    const max = Math.max(scale.x, scale.y, scale.z, 1)
    const dist = (max / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * 1.35
    camera.near = Math.max(dist / 100, 0.001)
    camera.far = dist * 100
    if (flat) camera.position.set(center.x, center.y, center.z + dist)
    else camera.position.set(center.x + dist, center.y + dist * 0.55, center.z + dist)
    camera.updateProjectionMatrix()
    controls.target.copy(center)
    controls.update()
    draw()
  }

  const setup = () => {
    if (!root || renderer) return
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000)
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.domElement.style.display = "block"
    root.appendChild(renderer.domElement)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = true
    const hemi = new THREE.HemisphereLight(0xffffff, 0x253044, 1.8)
    const sun = new THREE.DirectionalLight(0xffffff, 2.5)
    sun.position.set(4, 8, 6)
    scene.add(hemi, sun)
    grid = new THREE.GridHelper(10, 20, 0x334155, 0x1f2937)
    grid.material.opacity = 0.32
    grid.material.transparent = true
    scene.add(grid)
    resize = new ResizeObserver(size)
    resize.observe(root)
    size()
  }

  const read = async (file: string) => {
    const res = await sdk.fetch(url(file))
    if (!res.ok) throw new Error(`Unable to load ${file}: ${res.status}`)
    return res.text()
  }

  const bytes = async (file: string) => {
    const res = await sdk.fetch(url(file))
    if (!res.ok) throw new Error(`Unable to load ${file}: ${res.status}`)
    return res.arrayBuffer()
  }

  const materials = async (mgr: THREE.LoadingManager, file: string) => {
    const loader = new MTLLoader(mgr)
    loader.setResourcePath("")
    const mats = loader.parse(await read(file), "")
    mats.preload()
    return mats
  }

  const objMtl = (file: string, source: string) => {
    const line = source
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => /^mtllib\s+/i.test(item))
    if (line) return join(file, line.replace(/^mtllib\s+/i, "").trim())
    return file.replace(/\.[^/.]+$/i, ".mtl")
  }

  const loadObj = async (mgr: THREE.LoadingManager): Promise<Pack> => {
    const mtl = ext(props.path) === "mtl" ? props.path : undefined
    const obj = mtl ? props.path.replace(/\.mtl$/i, ".obj") : props.path
    const source = await read(obj).catch((err) => {
      if (mtl) throw new Error(`Matching OBJ not found for ${props.path}`)
      throw err
    })
    const path = mtl ?? objMtl(obj, source)
    const mats = await materials(mgr, path).catch(() => undefined)
    const loader = new OBJLoader(mgr)
    if (mats) loader.setMaterials(mats)
    return { obj: loader.parse(source), clips: [] }
  }

  const loadGltf = async (mgr: THREE.LoadingManager): Promise<Pack> => {
    const file = target()
    const loader = new GLTFLoader(mgr)
    draco?.dispose()
    draco = new DRACOLoader(mgr)
    draco.setDecoderPath("/draco/gltf/")
    draco.setDecoderConfig({ type: "wasm" })
    loader.setDRACOLoader(draco)
    const data = ext(file) === "glb" ? await bytes(file) : await read(file)
    return new Promise((resolve, reject) => {
      loader.parse(
        data,
        "",
        (gltf) => resolve({ obj: gltf.scene, clips: gltf.animations }),
        (err) => reject(err instanceof Error ? err : new Error("Unable to parse model")),
      )
    })
  }

  const loadDds = async (): Promise<Pack> => {
    const map = dds(await bytes(props.path))
    if (["BC6H", "BC7"].includes(map.label) && renderer && !renderer.extensions.has("EXT_texture_compression_bptc"))
      throw new Error("DDS texture requires BC compression support")
    if (map.label.startsWith("DXT") && renderer && !renderer.extensions.has("WEBGL_compressed_texture_s3tc"))
      throw new Error("DDS texture requires S3TC compression support")
    const width = map.width
    const height = map.height
    const max = Math.max(width, height)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width / max, height / max),
      new THREE.MeshBasicMaterial({ map: map.tex, side: THREE.DoubleSide, transparent: true }),
    )
    return {
      obj: mesh,
      clips: [],
      flat: true,
      info: `${width.toLocaleString()} × ${height.toLocaleString()} · ${map.label} · ${text(map.mipmaps, "mipmap")}`,
    }
  }

  const load = async () => {
    const id = ++seq
    setup()
    set({ error: undefined, info: "", loading: true })
    const mgr = new THREE.LoadingManager()
    mgr.setURLModifier((raw) => asset(target(), raw))
    const pack =
      ext(props.path) === "dds"
        ? await loadDds()
        : ["gltf", "glb", "bin"].includes(ext(props.path))
          ? await loadGltf(mgr)
          : await loadObj(mgr)
    if (id !== seq) {
      disposeObject(pack.obj)
      return
    }
    if (current && scene) {
      scene.remove(current)
      disposeObject(current)
    }
    mixer = undefined
    flat = !!pack.flat
    if (grid) grid.visible = !flat
    current = pack.obj
    scene?.add(pack.obj)
    if (pack.clips.length) {
      mixer = new THREE.AnimationMixer(pack.obj)
      pack.clips.forEach((clip) => mixer?.clipAction(clip).play())
    }
    set({ error: undefined, info: pack.info ?? stats(pack.obj, pack.clips), loading: false })
    frameModel(pack.obj)
  }

  const fail = (err: unknown) => {
    set({
      error: err instanceof Error ? err.message : String(err),
      info: "",
      loading: false,
    })
  }

  onMount(() => {
    setup()
    void load().catch(fail)
  })

  createEffect(
    on(
      () => props.path,
      () => {
        if (!root) return
        void load().catch(fail)
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    if (props.active) {
      start()
      return
    }
    stop()
    draw()
  })

  onCleanup(() => {
    seq++
    stop()
    resize?.disconnect()
    controls?.dispose()
    draco?.dispose()
    if (current) disposeObject(current)
    renderer?.dispose()
    root?.replaceChildren()
  })

  return (
    <div class="h-full min-h-0 flex flex-col bg-panel">
      <div class="h-10 flex items-center justify-between border-b border-border-weaker-base px-3 gap-3">
        <div class="min-w-0 flex items-center gap-2 text-13-regular">
          <Icon name="box" size="small" class="text-text-weak shrink-0" />
          <span class="truncate text-text-base">{title()}</span>
          <span class="rounded bg-surface-raised-base px-1.5 py-0.5 text-10-medium text-text-weak">{kind()}</span>
          <Show when={state.info}>
            {(info) => <span class="hidden md:inline truncate text-11-regular text-text-weak">{info()}</span>}
          </Show>
        </div>
        <Button size="small" variant="secondary" disabled={state.loading || !!state.error} onClick={() => frameModel()}>
          Reset View
        </Button>
      </div>
      <div class="relative min-h-0 flex-1 overflow-hidden">
        <div ref={root} class="absolute inset-0" />
        <Show when={state.loading}>
          <div class="absolute inset-0 flex items-center justify-center bg-panel/70 text-text-weak">
            Loading 3D model...
          </div>
        </Show>
        <Show when={state.error}>
          {(err) => (
            <div class="absolute inset-0 flex items-center justify-center bg-panel px-6 text-center text-red-400">
              {err()}
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

export { model as isModelPath }
export default ModelViewer
