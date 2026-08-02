import {
  createSignal,
  For,
  createResource,
  Show,
  createMemo,
  createEffect,
  onCleanup,
  onMount,
  on,
  createUniqueId,
} from "solid-js"
import { Portal } from "solid-js/web"
import { useSearchParams } from "@solidjs/router"
import { createMediaQuery } from "@solid-primitives/media"
import { media as mediaUrl } from "./media"
import {
  Palette,
  Component,
  Type,
  Image,
  Plus,
  Search,
  FileIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  Cuboid,
  Folder,
  Code,
  Link2,
  FileText,
  Shapes,
  Sparkles,
  LayoutGrid,
} from "lucide-solid"
import { useSDK } from "@/context/sdk"
import { TrellisStoreScope, useTrellisStore, type StoreEntity, type StoreFact } from "@/context/trellis-store"
import { trellisUrl } from "@/context/trellis"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ResizableSidebarLayout, ResizableSidebarPanel, ResizableSidebarToggle } from "@/components/route"
import { AffordanceShell } from "@/components/affordance"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { DialogGenerateAsset, type ImageProvider } from "@/components/dialog-generate-asset"
import { DialogAddLinkAsset } from "@/components/dialog-add-link-asset"
import { IconPickerDialog } from "@/components/database/prop-schema-editor"
import { AssetAudioDetail } from "@/components/asset-audio-detail"
import { apiErrorMessage } from "@/lib/api-error"
import { mediaGenerateRequest } from "@/lib/media-generate"
import { EntityIcon } from "@/lib/entity-theme"
import {
  CURATED_FONTS,
  DEFAULT_PALETTE_SWATCHES,
  brandSnapshotFacts,
  type BrandSemanticsView,
  entityFact,
  fontEntityFacts,
  fontEntityId,
  iconEntityFacts,
  paletteEntityFacts,
  parseJsonFact,
  readBrandSnapshot,
} from "@/lib/design-entity-client"
import {
  faviconForUrl,
  getCachedLinkPreview,
  loadLinkPreview,
  prefetchLinkPreviews,
  seedLinkPreview,
  type LinkPreviewData,
} from "@/lib/link-preview"
import { BrandGuide } from "@/components/design/brand-guide"
import { isStoreMutationToolCompleted } from "@/lib/trellis-store-sync"
import { patchSearchParams, searchParamOne } from "@/lib/focus/rail-params"
import { publishFocusRailHints } from "@/lib/focus/rail-labels"
import "./design-panel.css"

export type MediaSection = "assets" | "videos" | "documents" | "models" | "audio" | "links" | "sprites"
export type KitSection = "brand" | "icons" | "colors" | "type"
export type DesignKitSection = KitSection | "components" | "tokens"
export type DesignSection = DesignKitSection | MediaSection

export type StudioPanel = "assets" | "design"

const ASSET_SECTIONS = new Set<MediaSection>(["assets", "videos", "documents", "models", "audio", "links", "sprites"])

type AudioAnalysis = {
  contentType?: "speech" | "music" | "sfx" | "misc"
  confidence?: number
  bpm?: number
  key?: string
  genre?: string[]
  mood?: string[]
  subgenre?: string[]
  energy?: string
  instruments?: string[]
  timeSignature?: string
  musicalEra?: string
}

type Asset = {
  path: string
  name: string
  ext: string
  category: string
  kind?: string
  url?: string
  size?: number
  title?: string
  alt?: string
  description?: string
  palette?: string[]
  tone?: string
  tags?: string[]
  transcript?: string
  audioContentType?: "speech" | "music" | "sfx" | "misc"
  audioAnalysis?: AudioAnalysis
  analysisSource?: string
  analysisModel?: string
  analyzedAt?: string
  previewImage?: string
  previewFavicon?: string
}

type Generated = Asset & {
  model: string
  prompt: string
}

type DesignInventory = {
  entities: StoreEntity[]
  facts: StoreFact[]
}

type EntityDetail = {
  id: string
  facts: StoreFact[]
}

const DESIGN_ENTITY_TYPES = ["Brand", "Icon", "ColorPalette", "Font", "DesignComponent", "DesignToken"] as const
const DESIGN_PAGE = 500
const CONTENT_BATCH = 120

function observeOnce(el: Element | undefined, onVisible: () => void) {
  if (!el || typeof IntersectionObserver === "undefined") {
    onVisible()
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      onVisible()
    },
    { rootMargin: "320px 0px" },
  )
  observer.observe(el)
  return () => observer.disconnect()
}

const media = (section: DesignSection): section is MediaSection => ASSET_SECTIONS.has(section as MediaSection)

const uploadSection = (section: DesignSection) => media(section) && section !== "links"

const kit = (section: DesignSection) =>
  section === "brand" || section === "icons" || section === "colors" || section === "type"

const filter = (section: MediaSection, asset: Asset) => {
  if (section === "assets") return asset.category === "image"
  if (section === "videos") return asset.category === "video"
  if (section === "documents") return asset.category === "document"
  if (section === "models") return asset.category === "model3d" || asset.category === "texture"
  if (section === "links") return asset.category === "link"
  if (section === "sprites") {
    return (
      asset.category === "spritesheet" ||
      asset.path.includes(".trellis/media/sprites/") ||
      asset.path.includes(".trellis/sprites/")
    )
  }
  return asset.category === "audio"
}

const accept = (section: MediaSection) => {
  if (section === "assets") return "image/*"
  if (section === "videos") return "video/*"
  if (section === "documents") return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf"
  if (section === "models")
    return ".glb,.gltf,.obj,.fbx,.usdz,.stl,.ply,.dae,.blend,.usd,.abc,.hdr,.exr,.ktx,.ktx2,.dds,.tga,.psd"
  if (section === "sprites") return "image/png,image/webp,image/gif"
  return "audio/*"
}

const analyzableCategory = (category: string) =>
  category === "image" || category === "video" || category === "audio" || category === "document"

const category = (ext: string) => {
  const e = ext.toLowerCase()
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"].includes(e)) return "image"
  if (["glb", "gltf", "obj", "fbx", "usdz", "stl", "ply", "dae", "blend", "usd", "abc"].includes(e)) return "model3d"
  if (["hdr", "exr", "ktx", "ktx2", "dds", "tga", "psd"].includes(e)) return "texture"
  if (["mp4", "m4v", "mov", "webm", "ogv", "avi", "mkv"].includes(e)) return "video"
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a", "opus"].includes(e)) return "audio"
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(e)) return "document"
  return "other"
}

function AssetImage(props: { path: string; name: string; class?: string }) {
  const sdk = useSDK()
  let root: HTMLDivElement | undefined
  const [visible, setVisible] = createSignal(false)
  const [blobUrl] = createResource(
    () => (visible() ? props.path : undefined),
    async (path) => {
      const url = mediaUrl(sdk.url, path, sdk.directory)
      const res = await sdk.fetch(url)
      if (!res.ok) throw new Error(`Failed to load image (${res.status})`)
      return URL.createObjectURL(await res.blob())
    },
  )

  onMount(() => {
    const cleanup = observeOnce(root, () => setVisible(true))
    if (cleanup) onCleanup(cleanup)
  })

  createEffect(() => {
    const url = blobUrl()
    onCleanup(() => {
      if (url) URL.revokeObjectURL(url)
    })
  })

  const src = () => {
    if (blobUrl.loading || blobUrl.error) return
    return blobUrl()
  }

  return (
    <div ref={root} class="size-full flex items-center justify-center">
      <Show
        when={src()}
        fallback={
          <div class="flex flex-col items-center gap-2 text-text-weaker px-3 text-center">
            <Show when={visible() && blobUrl.loading} fallback={<ImageIcon class="size-8" />}>
              <Spinner class="size-5" />
            </Show>
            <span class="text-10-medium uppercase tracking-wider break-all">{props.name}</span>
          </div>
        }
      >
        {(url) => <img src={url()} alt={props.name} class={props.class} loading="lazy" />}
      </Show>
    </div>
  )
}

function linkPreviewForAsset(asset: {
  url?: string
  previewImage?: string
  previewFavicon?: string
  title?: string
  description?: string
}) {
  if (!asset.url) return undefined
  const cached = getCachedLinkPreview(asset.url)
  if (cached) return cached
  if (asset.previewImage || asset.previewFavicon || asset.title) {
    return {
      url: asset.url,
      image: asset.previewImage,
      favicon: asset.previewFavicon,
      title: asset.title,
      description: asset.description,
    }
  }
  return undefined
}

function LinkAssetPreview(props: {
  url: string
  title: string
  previewImage?: string
  previewFavicon?: string
  load: (url: string) => Promise<LinkPreviewData | undefined>
}) {
  let root: HTMLDivElement | undefined
  const initialPreview = (() => {
    const cached = getCachedLinkPreview(props.url)
    if (cached) return cached
    if (props.previewImage || props.previewFavicon) {
      return {
        url: props.url,
        image: props.previewImage,
        favicon: props.previewFavicon,
      }
    }
    return undefined
  })()
  const [preview, setPreview] = createSignal<LinkPreviewData | undefined>(initialPreview)
  const [fetching, setFetching] = createSignal(!preview()?.image && !props.previewImage)
  const [imageLoading, setImageLoading] = createSignal(!!(preview()?.image ?? props.previewImage))
  const [imageError, setImageError] = createSignal(false)
  const [visible, setVisible] = createSignal(false)
  let requested = false

  onMount(() => {
    const cleanup = observeOnce(root, () => setVisible(true))
    if (cleanup) onCleanup(cleanup)
  })

  createEffect(() => {
    if (!visible() || requested) return
    requested = true
    void props.load(props.url).then((data) => {
      if (data) setPreview(data)
      setFetching(false)
      const next = data?.image ?? props.previewImage
      setImageLoading(!!next)
      setImageError(!next)
    })
  })

  const image = () => preview()?.image ?? props.previewImage
  const favicon = () => preview()?.favicon ?? props.previewFavicon ?? faviconForUrl(props.url, 64)
  const showImage = () => !!image() && !imageError()
  const showSpinner = () => fetching() || (showImage() && imageLoading())

  return (
    <div ref={root} class="link-asset-preview">
      <Show
        when={showImage() ? image() : undefined}
        keyed
        fallback={
          <div class="link-asset-preview-fallback">
            <Show when={favicon()} fallback={<Link2 class="size-8" />}>
              {(icon) => <img src={icon()} alt="" class="link-asset-preview-favicon" loading="lazy" />}
            </Show>
            <span class="text-10-medium uppercase tracking-wider break-all px-2 text-center">{props.title}</span>
          </div>
        }
      >
        {(src) => (
          <img
            src={src}
            alt=""
            class="link-asset-preview-image"
            loading="lazy"
            onLoad={() => {
              setImageLoading(false)
              setImageError(false)
            }}
            onError={() => {
              setImageLoading(false)
              setImageError(true)
            }}
          />
        )}
      </Show>
      <Show when={showSpinner()}>
        <div class="link-asset-preview-loading">
          <Spinner class="size-5 text-text-weaker" />
        </div>
      </Show>
    </div>
  )
}

function LinkAssetTitle(props: {
  url: string
  title: string
  load: (url: string) => Promise<LinkPreviewData | undefined>
}) {
  let root: HTMLDivElement | undefined
  const [favicon, setFavicon] = createSignal(faviconForUrl(props.url, 32))
  const [visible, setVisible] = createSignal(false)
  let requested = false

  onMount(() => {
    const cleanup = observeOnce(root, () => setVisible(true))
    if (cleanup) onCleanup(cleanup)
  })

  createEffect(() => {
    if (!visible() || requested) return
    requested = true
    void props.load(props.url).then((data) => {
      if (data?.favicon) setFavicon(data.favicon)
    })
  })

  return (
    <div ref={root} class="flex items-center gap-1.5 min-w-0">
      <Show when={favicon()}>
        {(icon) => (
          <img
            src={icon()}
            alt=""
            class="size-3.5 rounded-sm shrink-0 bg-background-base object-contain"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        )}
      </Show>
      <span class="text-12-medium text-text-base truncate" title={props.title}>
        {props.title}
      </span>
    </div>
  )
}

function ContentLoadingState(props: { label: string }) {
  return (
    <div class="design-loading-state">
      <Spinner class="size-5 text-text-weaker" />
      <span>{props.label}</span>
    </div>
  )
}

function AssetPreview(props: { asset: Asset; load: (url: string) => Promise<LinkPreviewData | undefined> }) {
  return (
    <Show
      when={props.asset.category === "link" && props.asset.url}
      fallback={
        <Show
          when={props.asset.category === "image"}
          fallback={
            <div class="flex flex-col items-center gap-2 text-text-weaker group-hover:scale-110 transition-transform duration-300 px-2 text-center">
              <Show
                when={props.asset.category === "video"}
                fallback={
                  <Show
                    when={props.asset.category === "audio"}
                    fallback={
                      <Show
                        when={props.asset.category === "model3d" || props.asset.category === "texture"}
                        fallback={
                          <Show when={props.asset.category === "document"} fallback={<FileIcon class="size-8" />}>
                            <FileText class="size-8" />
                          </Show>
                        }
                      >
                        <Cuboid class="size-8" />
                      </Show>
                    }
                  >
                    <MusicIcon class="size-8" />
                  </Show>
                }
              >
                <VideoIcon class="size-8" />
              </Show>
              <span class="text-10-medium uppercase tracking-wider break-all px-1">{props.asset.ext}</span>
            </div>
          }
        >
          <AssetImage
            path={props.asset.path}
            name={props.asset.name}
            class="size-full object-contain group-hover:scale-110 transition-transform duration-500 ease-out"
          />
        </Show>
      }
    >
      {(url) => (
        <LinkAssetPreview
          url={url()}
          title={props.asset.title?.trim() || props.asset.name}
          previewImage={props.asset.previewImage}
          previewFavicon={props.asset.previewFavicon}
          load={props.load}
        />
      )}
    </Show>
  )
}

const initialSection = (panel: StudioPanel, override?: DesignSection): DesignSection => {
  if (override) {
    if (panel === "assets" && media(override)) return override
    if (panel === "design" && !media(override)) return override
  }
  if (typeof window === "undefined") return panel === "assets" ? "assets" : "brand"
  const params = new URLSearchParams(window.location.search)
  const section = params.get("section")
  if (panel === "assets") {
    if (section && media(section as DesignSection)) return section as MediaSection
    return "assets"
  }
  if (section && !media(section as DesignSection)) return section as DesignKitSection
  return "brand"
}

const ALL_SECTIONS: { id: DesignSection; label: string; icon: any; description: string; panel: StudioPanel }[] = [
  {
    id: "brand",
    label: "Brand",
    icon: Sparkles,
    description: "Project identity, tone, and linked design defaults.",
    panel: "design",
  },
  {
    id: "icons",
    label: "Icons",
    icon: Shapes,
    description: "Project-enabled icon set for UI and CMS.",
    panel: "design",
  },
  { id: "colors", label: "Colors", icon: Palette, description: "Color palettes and semantic roles.", panel: "design" },
  { id: "type", label: "Type", icon: Type, description: "Project fonts and typographic choices.", panel: "design" },
  {
    id: "tokens",
    label: "Tokens",
    icon: Component,
    description: "Design tokens like spacing, radius, and motion.",
    panel: "design",
  },
  {
    id: "components",
    label: "Components",
    icon: Code,
    description: "Reusable UI components and elements.",
    panel: "design",
  },
  { id: "assets", label: "Images", icon: Folder, description: "Images and visual media files.", panel: "assets" },
  { id: "videos", label: "Videos", icon: VideoIcon, description: "Video clips and motion media.", panel: "assets" },
  {
    id: "documents",
    label: "Documents",
    icon: FileText,
    description: "PDFs, docs, spreadsheets, and presentations.",
    panel: "assets",
  },
  {
    id: "links",
    label: "Links",
    icon: Link2,
    description: "Reusable bookmarks and external references.",
    panel: "assets",
  },
  {
    id: "audio",
    label: "Audio",
    icon: MusicIcon,
    description: "Sound effects, music, and voice clips.",
    panel: "assets",
  },
  {
    id: "models",
    label: "3D models",
    icon: Cuboid,
    description: "3D models, meshes, and texture maps.",
    panel: "assets",
  },
  {
    id: "sprites",
    label: "Sprite sheets",
    icon: LayoutGrid,
    description: "2D pixel art atlases and sprite sheets (graph projections coming).",
    panel: "assets",
  },
]

function Inner(props: { panel: StudioPanel; section?: DesignSection }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const store = useTrellisStore()
  const compact = createMediaQuery("(max-width: 1023px)")
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeSection, setActiveSection] = createSignal<DesignSection>(initialSection(props.panel, props.section))
  const uploadId = createUniqueId()
  const sections = () => ALL_SECTIONS.filter((s) => s.panel === props.panel)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [pending, setPending] = createSignal<Asset[]>([])
  const [iconPickerOpen, setIconPickerOpen] = createSignal(false)

  createEffect(
    on(
      () => props.section,
      (section) => {
        if (!section) return
        if (props.panel === "assets" && media(section)) setActiveSection(section)
        if (props.panel === "design" && !media(section)) setActiveSection(section)
      },
    ),
  )

  const loadAssets = async () => {
    try {
      const res = await sdk.fetch(`${sdk.url}/file/media/list?directory=${encodeURIComponent(sdk.directory)}`)
      if (!res.ok) return []
      return (await res.json()) as Asset[]
    } catch {
      return []
    }
  }

  const [assets, { refetch: refetchAssets }] = createResource(
    () => (props.panel === "assets" ? `${sdk.url}:${sdk.directory}` : undefined),
    loadAssets,
    { initialValue: [] },
  )

  const loadDesignInventory = async (): Promise<DesignInventory> => {
    if (props.panel !== "design") return { entities: [], facts: [] }
    const entities: StoreEntity[] = []
    try {
      for (const type of DESIGN_ENTITY_TYPES) {
        for (let offset = 0; ; offset += DESIGN_PAGE) {
          const res = await sdk.fetch(
            trellisUrl(
              sdk.url,
              sdk.directory,
              `/store/entities?type=${encodeURIComponent(type)}&limit=${DESIGN_PAGE}&offset=${offset}`,
            ),
          )
          if (!res.ok) break
          const page = (await res.json()) as StoreEntity[]
          entities.push(...page)
          if (page.length < DESIGN_PAGE) break
        }
      }

      const facts: StoreFact[] = []
      for (let i = 0; i < entities.length; i += 12) {
        const chunk = entities.slice(i, i + 12)
        const details = await Promise.all(
          chunk.map(async (entity): Promise<EntityDetail | undefined> => {
            try {
              const res = await sdk.fetch(
                trellisUrl(sdk.url, sdk.directory, `/store/entity/${encodeURIComponent(entity.id)}`),
              )
              if (!res.ok) return undefined
              return (await res.json()) as EntityDetail
            } catch {
              return undefined
            }
          }),
        )
        for (const detail of details) {
          if (detail) facts.push(...detail.facts)
        }
      }
      return { entities, facts }
    } catch {
      return { entities, facts: [] }
    }
  }

  const [designInventory, { refetch: refetchDesignInventory }] = createResource(
    () => (props.panel === "design" ? `${sdk.url}:${sdk.directory}` : undefined),
    loadDesignInventory,
    { initialValue: { entities: [], facts: [] } satisfies DesignInventory },
  )

  createEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ section?: DesignSection; entity?: string; path?: string }>).detail
      if (!detail) return
      if (detail.section) {
        const target = detail.section
        if (media(target) && props.panel !== "assets") return
        if (!media(target) && props.panel !== "design") return
        setActiveSection(target)
      }
      const list = merged()
      const match = detail.path
        ? list.find((item) => item.path === detail.path)
        : detail.entity
          ? list.find(
              (item) =>
                item.path.includes(detail.entity!.split(":").pop() ?? "") ||
                item.url?.includes(detail.entity!.split(":").pop() ?? ""),
            )
          : undefined
      if (match) setSelectedAsset(match)
    }
    window.addEventListener("design-navigate", handler)
    onCleanup(() => window.removeEventListener("design-navigate", handler))
  })

  createEffect(() => {
    if (props.panel !== "design") return
    const stop = sdk.event.listen((e) => {
      if (isStoreMutationToolCompleted(e.details)) {
        void refetchDesignInventory()
        return
      }
      if (e.details.type !== "file.watcher.updated") return
      const props = e.details.properties as { file?: string; event?: string }
      const file = props.file?.replace(/^\/+/, "")
      if (!file) return
      if (
        file.includes(".trellis/brand") &&
        (props.event === "add" || props.event === "change" || props.event === "unlink")
      ) {
        void refetchDesignInventory()
      }
      if (!file.includes(".trellis/media") && !file.includes(".trellis/assets")) return
      if (props.event === "add" || props.event === "change" || props.event === "unlink") {
        void refetchAssets()
      }
    })
    onCleanup(stop)
  })

  const merged = createMemo(() => {
    const base = assets() ?? []
    const extra = pending().filter((item) => !base.some((b) => b.path === item.path))
    return [...extra, ...base]
  })

  const [selectedAsset, setSelectedAsset] = createSignal<Asset | null>(null)
  const [isSaving, setIsSaving] = createSignal(false)

  createEffect(() => {
    const path = searchParamOne(searchParams.asset)
    if (!path || props.panel !== "assets") return
    const match = merged().find((item) => item.path === path)
    if (match) setSelectedAsset(match)
  })

  createEffect(
    on(
      () => [props.panel, activeSection(), selectedAsset()?.path] as const,
      ([panel, section, assetPath]) => {
        if (panel !== "assets" && panel !== "design") return
        const next = patchSearchParams(searchParams, {
          section,
          asset: panel === "assets" ? (assetPath ?? null) : null,
        })
        if (next) setSearchParams(next, { replace: true })
      },
    ),
  )

  createEffect(() => {
    if (props.panel !== "assets" && props.panel !== "design") return
    const section = activeSection()
    const asset = selectedAsset()
    const sectionMeta = sections().find((s) => s.id === section)
    const surface = props.panel === "design" ? "design" : "assets"

    publishFocusRailHints({
      surface,
      routeSlug: section,
      itemSlug: asset?.path,
      routeLabel: sectionMeta?.label,
      itemLabel: asset ? asset.title?.trim() || asset.name : undefined,
    })
  })

  onCleanup(() => publishFocusRailHints(null))

  const [isAnalyzing, setIsAnalyzing] = createSignal(false)
  const [isGenerating, setIsGenerating] = createSignal(false)
  const [uploadingBrandLogo, setUploadingBrandLogo] = createSignal(false)
  const [savingBrandSemantics, setSavingBrandSemantics] = createSignal(false)
  const [savingBrand, setSavingBrand] = createSignal(false)
  const designEntities = () => designInventory()?.entities ?? []
  const designFacts = () => designInventory()?.facts ?? []

  const components = createMemo(() => designEntities().filter((e) => e.type === "DesignComponent"))
  const tokens = createMemo(() => designEntities().filter((e) => e.type === "DesignToken"))
  const iconEntities = createMemo(() => designEntities().filter((e) => e.type === "Icon"))
  const paletteEntities = createMemo(() => designEntities().filter((e) => e.type === "ColorPalette"))
  const fontEntities = createMemo(() => designEntities().filter((e) => e.type === "Font"))

  const brandSnapshot = createMemo(() => {
    return readBrandSnapshot(designFacts(), designEntities())
  })

  const counts = createMemo(() => {
    const list = merged()
    return {
      brand: brandSnapshot() ? 1 : 0,
      icons: iconEntities().length,
      colors: paletteEntities().length,
      type: fontEntities().length,
      assets: list.filter((a) => a.category === "image").length,
      videos: list.filter((a) => a.category === "video").length,
      documents: list.filter((a) => a.category === "document").length,
      links: list.filter((a) => a.category === "link").length,
      models: list.filter((a) => a.category === "model3d" || a.category === "texture").length,
      audio: list.filter((a) => a.category === "audio").length,
      components: components().length,
      tokens: tokens().length,
      sprites: list.filter((a) => filter("sprites", a)).length,
    } satisfies Record<DesignSection, number>
  })

  const filteredItems = () => {
    const q = searchQuery().toLowerCase()
    if (activeSection() === "brand") return []
    if (media(activeSection())) {
      const list = merged().filter((a) => filter(activeSection() as MediaSection, a))
      if (!q) return list
      return list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.path.toLowerCase().includes(q) ||
          a.url?.toLowerCase().includes(q) ||
          a.title?.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.tone?.toLowerCase().includes(q) ||
          a.tags?.some((tag) => tag.toLowerCase().includes(q)),
      )
    }
    if (activeSection() === "icons") {
      const list = iconEntities()
      if (!q) return list
      return list.filter((entity) => {
        const key = String(entityFact(designFacts(), entity.id, "key") ?? "")
        const library = String(entityFact(designFacts(), entity.id, "library") ?? "")
        return `${key} ${library} ${entity.id}`.toLowerCase().includes(q)
      })
    }
    if (activeSection() === "colors") {
      const list = paletteEntities()
      if (!q) return list
      return list.filter((entity) => {
        const name = String(entityFact(designFacts(), entity.id, "name") ?? "")
        return `${name} ${entity.id}`.toLowerCase().includes(q)
      })
    }
    if (activeSection() === "type") {
      const list = fontEntities()
      if (!q) return list
      return list.filter((entity) => {
        const family = String(entityFact(designFacts(), entity.id, "family") ?? "")
        return `${family} ${entity.id}`.toLowerCase().includes(q)
      })
    }
    if (activeSection() === "components") {
      const list = components()
      if (!q) return list
      return list.filter((c) => {
        const label = designFacts().find((f) => f.e === c.id && f.a === "label")?.v as string
        return label?.toLowerCase().includes(q)
      })
    }
    if (activeSection() === "tokens") {
      const list = tokens()
      if (!q) return list
      return list.filter((t) => {
        const label = designFacts().find((f) => f.e === t.id && f.a === "label")?.v as string
        return label?.toLowerCase().includes(q)
      })
    }
    return []
  }
  const [visibleLimit, setVisibleLimit] = createSignal(CONTENT_BATCH)
  createEffect(
    on(
      () => `${activeSection()}:${searchQuery()}`,
      () => setVisibleLimit(CONTENT_BATCH),
    ),
  )
  const visibleItems = createMemo(() => filteredItems().slice(0, visibleLimit()))
  const hiddenItemCount = createMemo(() => Math.max(0, filteredItems().length - visibleItems().length))
  const sectionLoading = () =>
    media(activeSection()) ? assets.loading : props.panel === "design" && designInventory.loading
  const contentLoading = () =>
    sectionLoading() && filteredItems().length === 0 && !(activeSection() === "brand" && brandSnapshot())
  const loadingLabel = () => (media(activeSection()) ? "Loading assets..." : "Loading design inventory...")

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  const raw = (p: string) => mediaUrl(sdk.url, p, sdk.directory)

  const loadLinkPreviewFor = (url: string) => loadLinkPreview((path) => sdk.fetch(path), sdk.url, sdk.directory, url)

  createEffect(() => {
    const links = merged().filter((asset): asset is Asset & { url: string } => asset.category === "link" && !!asset.url)
    if (!links.length) return
    const visibleLinks = links.slice(0, CONTENT_BATCH)
    for (const asset of visibleLinks) {
      if (asset.previewImage || asset.previewFavicon) {
        seedLinkPreview({
          url: asset.url,
          image: asset.previewImage,
          favicon: asset.previewFavicon,
          title: asset.title,
        })
      }
    }
    const run = () =>
      prefetchLinkPreviews(
        (path) => sdk.fetch(path),
        sdk.url,
        sdk.directory,
        visibleLinks.map((asset) => asset.url),
      )
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(() => void run(), { timeout: 2500 })
      onCleanup(() => (window as any).cancelIdleCallback(id))
      return
    }
    const id = setTimeout(() => void run(), 250)
    onCleanup(() => clearTimeout(id))
  })

  const label = (asset: Asset) => asset.title?.trim() || asset.name

  const note = (asset: Asset) => asset.description?.trim() || asset.alt?.trim() || asset.tone?.trim()

  const swatch = (color: string) =>
    /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color.trim()) ? color.trim() : undefined

  const patchAsset = (path: string, patch: Partial<Asset>) => {
    setPending((list) => list.map((item) => (item.path === path ? { ...item, ...patch } : item)))
    const current = selectedAsset()
    if (current?.path === path) setSelectedAsset({ ...current, ...patch })
  }

  const describeAsset = async (asset: Asset, force = false) => {
    const res = await sdk.fetch(`${sdk.url}/file/media/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: asset.path, force }),
    })
    if (!res.ok) return
    const data = (await res.json()) as Partial<Asset>
    if (
      !data.description &&
      !data.tone &&
      !data.tags?.length &&
      !data.palette?.length &&
      !data.transcript &&
      !data.audioAnalysis
    )
      return
    patchAsset(asset.path, data)
    await refetchAssets()
  }

  const refreshBrand = async () => {
    const snapshot = readBrandSnapshot(designFacts(), designEntities())
    if (!snapshot) {
      showToast({ variant: "error", title: "No brand to refresh" })
      return
    }
    const result = await store.assert(brandSnapshotFacts(snapshot))
    if (result) await refetchDesignInventory()
    showToast(result ? { title: "Brand snapshot refreshed" } : { variant: "error", title: "Failed to refresh brand" })
  }

  const uploadBrandLogo = async (file: File) => {
    const snapshot = brandSnapshot()
    if (!snapshot) return
    if (!file.type.startsWith("image/")) {
      showToast({ variant: "error", title: "Logo must be an image file" })
      return
    }
    const ext =
      file.name.match(/\.(svg|png|jpe?g|webp|avif)$/i)?.[1]?.toLowerCase() ??
      (file.type.includes("svg") ? "svg" : "png")
    const targetName = `logo.${ext}`
    setUploadingBrandLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file, targetName)
      formData.append("path", ".trellis/brand")
      formData.append("name", targetName)
      const res = await sdk.fetch(`${sdk.url}/file/upload?directory=${encodeURIComponent(sdk.directory)}`, {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Upload failed")
      }
      const data = (await res.json()) as { path: string }
      const asserted = await store.assert([{ e: snapshot.id, a: "logoPath", v: data.path }])
      if (!asserted) throw new Error("Failed to save logo on brand")
      await refreshBrand()
      showToast({ title: "Brand logo updated" })
    } catch (err) {
      showToast({
        variant: "error",
        title: "Logo upload failed",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setUploadingBrandLogo(false)
    }
  }

  const saveBrandSemantics = async (semantics: BrandSemanticsView) => {
    const snapshot = brandSnapshot()
    if (!snapshot) return
    setSavingBrandSemantics(true)
    try {
      const result = await store.assert([{ e: snapshot.id, a: "semantics", v: JSON.stringify(semantics) }])
      if (!result) {
        showToast({ variant: "error", title: "Failed to update brand voice" })
        return
      }
      await refreshBrand()
    } finally {
      setSavingBrandSemantics(false)
    }
  }

  const saveBrandName = async (name: string) => {
    const snapshot = brandSnapshot()
    if (!snapshot || !name.trim()) return
    setSavingBrand(true)
    try {
      const result = await store.assert([{ e: snapshot.id, a: "name", v: name.trim() }])
      if (!result) {
        showToast({ variant: "error", title: "Failed to update brand name" })
        return
      }
      await refreshBrand()
    } finally {
      setSavingBrand(false)
    }
  }

  const saveBrandSwatch = async (paletteId: string, role: string, color: string) => {
    const snapshot = brandSnapshot()
    if (!snapshot) return
    const palette = snapshot.palettes.find((item) => item.id === paletteId)
    if (!palette) return
    setSavingBrand(true)
    try {
      const swatches = { ...palette.swatches, [role]: color }
      const result = await store.assert([{ e: paletteId, a: "swatches", v: JSON.stringify(swatches) }])
      if (!result) {
        showToast({ variant: "error", title: "Failed to update color" })
        return
      }
      await refreshBrand()
    } finally {
      setSavingBrand(false)
    }
  }

  const saveBrandFontFamily = async (family: string) => {
    const snapshot = brandSnapshot()
    if (!snapshot || !family.trim()) return
    const trimmed = family.trim()
    const fontId = fontEntityId(trimmed)
    const curated = CURATED_FONTS.find((font) => font.family === trimmed)
    setSavingBrand(true)
    try {
      const facts: Array<{ e: string; a: string; v: string }> = []
      if (!snapshot.fonts.some((font) => font.id === fontId)) {
        const fontFacts = fontEntityFacts({
          family: trimmed,
          category: curated?.category,
          variants: curated ? [...curated.variants] : ["regular"],
        })
        if (fontFacts) facts.push(...fontFacts)
      }
      const fontIds = [...new Set([...snapshot.fonts.map((font) => font.id), fontId])]
      facts.push(
        { e: snapshot.id, a: "fontIds", v: JSON.stringify(fontIds) },
        { e: snapshot.id, a: "headingFontId", v: fontId },
        { e: snapshot.id, a: "bodyFontId", v: fontId },
      )
      const result = await store.assert(facts)
      if (!result) {
        showToast({ variant: "error", title: "Failed to update typography" })
        return
      }
      await refreshBrand()
    } finally {
      setSavingBrand(false)
    }
  }

  const onAdd = async () => {
    if (activeSection() === "brand") return
    if (activeSection() === "icons") {
      setIconPickerOpen(true)
      return
    }
    if (activeSection() === "type") {
      const family = window.prompt(`Font family (${CURATED_FONTS.map((font) => font.family).join(", ")}, …):`, "Inter")
      if (!family?.trim()) return
      const curated = CURATED_FONTS.find((font) => font.family.toLowerCase() === family.trim().toLowerCase())
      const facts = fontEntityFacts({
        family: family.trim(),
        category: curated?.category,
        variants: curated ? [...curated.variants] : ["regular"],
        catalogRef: curated ? `google-fonts:${curated.family}` : undefined,
      })
      const result = await store.assert(facts)
      if (result) await refetchDesignInventory()
      showToast(result ? { title: "Font added" } : { variant: "error", title: "Failed to add font" })
      return
    }
    if (activeSection() === "colors") {
      const name = window.prompt("Palette name:", "Custom")
      if (!name?.trim()) return
      const facts = paletteEntityFacts({
        name: name.trim(),
        swatches: { ...DEFAULT_PALETTE_SWATCHES },
        tags: ["custom"],
      })
      const result = await store.assert(facts)
      if (result) await refetchDesignInventory()
      showToast(result ? { title: "Palette added" } : { variant: "error", title: "Failed to add palette" })
      return
    }
    if (activeSection() === "links") {
      openAddLink()
      return
    }
    if (uploadSection(activeSection())) return

    const name = window.prompt(`Enter ${activeSection().slice(0, -1)} name:`)
    if (!name) return

    const id = `design:${activeSection()}:${Date.now()}`
    const type = activeSection() === "components" ? "DesignComponent" : "DesignToken"

    const result = await store.assert([
      { e: id, a: "type", v: type },
      { e: id, a: "label", v: name },
      { e: id, a: "createdAt", v: new Date().toISOString() },
    ])

    if (result) {
      await refetchDesignInventory()
      showToast({ title: `${activeSection().slice(0, -1)} added` })
    } else {
      showToast({ variant: "error", title: "Failed to add item" })
    }
  }

  const onDeleteEntity = async (id: string) => {
    if (!confirm("Delete this item?")) return
    const facts = designFacts().filter((f) => f.e === id)
    const result = await store.retract(facts)
    if (result) {
      await refetchDesignInventory()
      showToast({ title: "Item deleted" })
    }
  }

  const enrichUploadedAsset = async (asset: Asset) => {
    if (!analyzableCategory(asset.category)) return
    setIsAnalyzing(true)
    try {
      await describeAsset(asset, true)
      const current = selectedAsset()
      if (current?.path === asset.path) {
        const refreshed = merged().find((item) => item.path === asset.path)
        if (refreshed) setSelectedAsset(refreshed)
      }
      showToast({ title: "Semantic metadata generated" })
    } catch {
      showToast({
        variant: "error",
        title: "Metadata analysis failed",
        description: "Check GEMINI_API_KEY or try Regenerate in the asset panel.",
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const onUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement
    if (!input.files?.length) return
    const file = input.files[0]
    const formData = new FormData()
    formData.append("file", file)
    formData.append("path", ".trellis/media")

    try {
      const res = await sdk.fetch(`${sdk.url}/file/upload?directory=${encodeURIComponent(sdk.directory)}`, {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        const data = (await res.json()) as { path: string; size: number }
        const ext = data.path.split(".").pop()?.toLowerCase() ?? "bin"
        const asset: Asset = {
          path: data.path,
          name: data.path.split("/").pop() ?? file.name,
          ext,
          category: category(ext),
          size: data.size,
        }
        setPending((list) => [asset, ...list])
        setSelectedAsset(asset)
        showToast({
          title: "Asset uploaded",
          description: analyzableCategory(asset.category) ? "Analyzing with Gemini…" : undefined,
        })
        await refetchAssets()
        if (analyzableCategory(asset.category)) {
          await enrichUploadedAsset(asset)
        }
      } else {
        const err = await res.json()
        showToast({ variant: "error", title: "Upload failed", description: err.error })
      }
    } catch (err) {
      showToast({ variant: "error", title: "Upload failed", description: String(err) })
    } finally {
      input.value = ""
    }
  }

  const updateMetadata = async (updates: { title?: string; alt?: string; description?: string }) => {
    const asset = selectedAsset()
    if (!asset) return
    setIsSaving(true)
    try {
      const res = await sdk.fetch(`${sdk.url}/file/media/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: asset.path, ...updates }),
      })
      if (res.ok) {
        showToast({ title: "Metadata updated" })
        patchAsset(asset.path, updates)
        await refetchAssets()
      } else {
        showToast({ variant: "error", title: "Update failed" })
      }
    } catch (err) {
      showToast({ variant: "error", title: "Update failed", description: String(err) })
    } finally {
      setIsSaving(false)
    }
  }

  const generateDescription = async () => {
    const asset = selectedAsset()
    if (!asset) return
    setIsSaving(true)
    try {
      await describeAsset(asset, true)
      showToast({ title: "Metadata generated" })
    } catch (err) {
      showToast({ variant: "error", title: "Generation failed" })
    } finally {
      setIsSaving(false)
    }
  }

  const runGenerate = async (input: { prompt: string; provider: ImageProvider }) => {
    setIsGenerating(true)
    try {
      const { url, body } = mediaGenerateRequest(sdk.url, sdk.directory, input)
      const res = await sdk.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(apiErrorMessage(body, `Image generation failed (${res.status})`))
      }

      const asset = (await res.json()) as Generated
      setPending((list) => [asset, ...list])
      setActiveSection("assets")
      setSelectedAsset(asset)
      showToast({ title: "Image asset generated", description: asset.name })
      await refetchAssets()
    } finally {
      setIsGenerating(false)
    }
  }

  const openGenerate = () => {
    dialog.show(() => <DialogGenerateAsset onGenerate={runGenerate} />)
  }

  const runCreateLink = async (input: { url: string; title?: string; description?: string }) => {
    const res = await sdk.fetch(`${sdk.url}/file/media/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to add link" }))
      throw new Error(err.error ?? "Failed to add link")
    }
    const asset = (await res.json()) as Asset
    setPending((list) => [asset, ...list])
    setActiveSection("links")
    setSelectedAsset(asset)
    showToast({ title: "Link asset added", description: asset.url })
    if (asset.url) {
      seedLinkPreview({
        url: asset.url,
        image: asset.previewImage,
        favicon: asset.previewFavicon,
        title: asset.title,
      })
      void prefetchLinkPreviews((path) => sdk.fetch(path), sdk.url, sdk.directory, [asset.url])
    }
    await refetchAssets()
    void describeAsset(asset).catch(() => undefined)
  }

  const openAddLink = () => {
    dialog.show(() => <DialogAddLinkAsset onCreate={runCreateLink} />)
  }

  const uploadAccept = createMemo(() => {
    const section = activeSection()
    return uploadSection(section) ? accept(section) : undefined
  })

  const sidebar = () => (
    <ResizableSidebarPanel>
      {(layout) => (
        <div
          class="design-sidebar"
          data-ui-region="sidebar"
          data-ui-slot="sidebar"
          style={compact() ? undefined : { width: `${layout.width()}px` }}
        >
          <div class="h-10 flex items-center px-3 border-b border-border-weaker-base shrink-0">
            <span class="text-xs font-medium text-text-weak opacity-80 uppercase tracking-wider">
              {props.panel === "assets" ? "Assets" : "Design"}
            </span>
          </div>
          <div class="design-sidebar-items flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
            <For each={sections()}>
              {(s, idx) => (
                <button
                  onClick={() => {
                    setActiveSection(s.id)
                    setSelectedAsset(null)
                  }}
                  style={{ "animation-delay": `${idx() * 50}ms` }}
                  class="stagger-item design-section-btn"
                  classList={{
                    active: activeSection() === s.id,
                  }}
                >
                  <span class="design-section-label">
                    <s.icon class="size-4 opacity-70 shrink-0" />
                    <span class="truncate">{s.label}</span>
                  </span>
                  <span class="design-section-count">{counts()[s.id]}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      )}
    </ResizableSidebarPanel>
  )

  const isSearchable = () => media(activeSection()) || (kit(activeSection()) && activeSection() !== "brand")
  const searchPlaceholder = () =>
    kit(activeSection()) ? "Search design inventory…" : "Search assets…"

  const addLabel = () => {
    const section = activeSection()
    if (section === "brand") return undefined
    if (uploadSection(section)) return undefined // handled via file input in actions slot
    if (section === "type") return "Add font"
    if (section === "colors") return "Add palette"
    if (section === "icons") return "Add icon"
    if (section === "links") return "Add link"
    return `Add ${section.slice(0, -1)}`
  }

  const headerActions = () => (
    <>
      <Show when={activeSection() === "assets"}>
        <Button size="small" variant="secondary" onClick={openGenerate} disabled={isGenerating()}>
          <Palette class="size-3.5 mr-1.5" />
          {isGenerating() ? "Generating..." : "Generate"}
        </Button>
      </Show>
      <Show when={uploadSection(activeSection())}>
        <label
          for={uploadId}
          data-component="button"
          data-size="small"
          data-variant="primary"
          class="design-upload-trigger"
        >
          <Plus class="size-3.5 mr-1.5" />
          Add Asset
        </label>
      </Show>
    </>
  )

  const detailSidebar = () => (
    <Show when={selectedAsset()}>
      {(asset) => (
        <Show when={media(activeSection()) && filter(activeSection() as MediaSection, asset())}>
          <div class="detail-sidebar border-l border-border-weaker-base h-full">
            <div class="h-[40px] flex items-center justify-between px-4 border-b border-border-weaker-base shrink-0">
              <span class="text-13-semibold text-text-base">Asset Details</span>
              <IconButton
                icon="plus"
                variant="ghost"
                size="small"
                class="rotate-45"
                onClick={() => setSelectedAsset(null)}
              />
            </div>
            <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              <div class="aspect-square rounded-lg bg-background-base border border-border-weaker-base flex items-center justify-center overflow-hidden shrink-0">
                <Show
                  when={asset().category === "image"}
                  fallback={
                    <Show
                      when={asset().category === "audio"}
                      fallback={
                        <Show
                          when={asset().category === "link"}
                          fallback={
                            <div class="flex flex-col items-center gap-2 text-text-weaker p-4">
                              <Show
                                when={asset().category === "model3d" || asset().category === "texture"}
                                fallback={<FileText class="size-12 opacity-40" />}
                              >
                                <Cuboid class="size-12 opacity-40 animate-pulse" />
                              </Show>
                              <span class="text-11-medium uppercase tracking-wider">{asset().ext || "file"}</span>
                            </div>
                          }
                        >
                          <div class="flex flex-col items-center gap-3 text-text-weaker p-4 w-full">
                            <Show
                              when={linkPreviewForAsset(asset())}
                              fallback={
                                <>
                                  <Link2 class="size-12 opacity-40" />
                                  <span class="text-11-regular truncate max-w-full">{asset().url}</span>
                                </>
                              }
                            >
                              {(preview) => (
                                <div class="flex flex-col items-center gap-2 text-center w-full">
                                  <Show
                                    when={preview().image || asset().previewImage}
                                    fallback={
                                      <Show
                                        when={preview().favicon || asset().previewFavicon}
                                        fallback={<Link2 class="size-10 opacity-40" />}
                                      >
                                        <img
                                          src={preview().favicon || asset().previewFavicon}
                                          class="size-8 rounded object-contain"
                                          alt=""
                                        />
                                      </Show>
                                    }
                                  >
                                    <img
                                      src={preview().image || asset().previewImage}
                                      class="h-20 w-32 object-cover rounded border border-border-weaker-base shadow-sm"
                                      alt=""
                                    />
                                  </Show>
                                  <span class="text-11-semibold text-text-strong line-clamp-2">
                                    {preview().title || asset().title || asset().name}
                                  </span>
                                  <span class="text-10-regular text-text-weaker line-clamp-2">
                                    {preview().description || asset().description}
                                  </span>
                                </div>
                              )}
                            </Show>
                          </div>
                        </Show>
                      }
                    >
                      <AssetAudioDetail asset={asset()} src={raw(asset().path)} />
                    </Show>
                  }
                >
                  <img src={raw(asset().path)} class="max-w-full max-h-full object-contain" alt={asset().alt || ""} />
                </Show>
              </div>

              <div>
                <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Title</label>
                <input
                  type="text"
                  value={asset().title || ""}
                  placeholder="Add a title..."
                  onInput={(e) => void updateMetadata({ title: e.currentTarget.value })}
                  class="w-full bg-surface-raised-base border border-border-weaker-base rounded px-2.5 py-1.5 text-12-regular text-text-base outline-0 focus:border-border-base transition-colors"
                />
              </div>

              <div>
                <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Alt Text</label>
                <input
                  type="text"
                  value={asset().alt || ""}
                  placeholder="Add alt text for accessibility..."
                  onInput={(e) => void updateMetadata({ alt: e.currentTarget.value })}
                  class="w-full bg-surface-raised-base border border-border-weaker-base rounded px-2.5 py-1.5 text-12-regular text-text-base outline-0 focus:border-border-base transition-colors"
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-11-medium text-text-weaker uppercase block">Description</label>
                  <IconButton
                    icon="palette"
                    variant="ghost"
                    size="small"
                    onClick={generateDescription}
                    disabled={isSaving() || isAnalyzing()}
                  />
                </div>
                <textarea
                  rows={4}
                  value={asset().description || ""}
                  placeholder={
                    isAnalyzing() ? "Analyzing with Gemini..." : "Add a description (click wand to auto-generate)..."
                  }
                  onInput={(e) => void updateMetadata({ description: e.currentTarget.value })}
                  disabled={isAnalyzing()}
                  class="w-full bg-surface-raised-base border border-border-weaker-base rounded px-2.5 py-1.5 text-12-regular text-text-base outline-0 focus:border-border-base transition-colors resize-none"
                />
              </div>

              <Show when={asset().palette?.length}>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Palette</label>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={asset().palette}>
                      {(color) => (
                        <div
                          class="size-6 rounded border border-border-weaker-base cursor-pointer hover:scale-105 transition-transform"
                          style={{ background: color }}
                          onClick={() => {
                            navigator.clipboard.writeText(color).then(() => {
                              showToast({ title: `Copied ${color}` })
                            })
                          }}
                          title={`Copy ${color}`}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <Show when={asset().category === "audio" && (asset().audioContentType || asset().kind)}>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Audio Type</label>
                  <div class="text-12-regular text-text-base capitalize">
                    {asset().audioContentType || asset().kind}
                  </div>
                </div>
              </Show>

              <Show when={asset().audioAnalysis?.bpm}>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">BPM</label>
                  <div class="text-12-regular text-text-base">{asset().audioAnalysis?.bpm}</div>
                </div>
              </Show>

              <Show when={asset().audioAnalysis?.key}>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Key</label>
                  <div class="text-12-regular text-text-base">{asset().audioAnalysis?.key}</div>
                </div>
              </Show>

              <Show when={asset().audioAnalysis?.genre?.length}>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Genre</label>
                  <div class="text-12-regular text-text-base break-words">
                    {asset().audioAnalysis?.genre?.join(", ")}
                  </div>
                </div>
              </Show>

              <Show when={asset().audioAnalysis?.mood?.length}>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Mood</label>
                  <div class="text-12-regular text-text-base break-words">
                    {asset().audioAnalysis?.mood?.join(", ")}
                  </div>
                </div>
              </Show>

              <Show when={asset().transcript}>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1.5 block">Transcript</label>
                  <textarea
                    rows={8}
                    value={asset().transcript || ""}
                    readOnly
                    class="w-full bg-surface-raised-base border border-border-weaker-base rounded px-2 py-1.5 text-12-regular resize-none"
                  />
                </div>
              </Show>

              <div class="grid grid-cols-2 gap-4 pt-2 border-t border-border-weaker-base">
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1 block">Size</label>
                  <div class="text-12-regular text-text-base">{formatSize(asset().size)}</div>
                </div>
                <div>
                  <label class="text-11-medium text-text-weaker uppercase mb-1 block">Type</label>
                  <div class="text-12-regular text-text-base uppercase">{asset().ext}</div>
                </div>
              </div>
            </div>
          <div class="p-4 border-t border-border-weaker-base flex flex-col gap-2 bg-background-base shrink-0">
            <Button
              variant="secondary"
              class="w-full text-text-destructive hover:bg-red-500/10"
              onClick={async () => {
                if (confirm("Delete this asset?")) {
                  await sdk.fetch(`${sdk.url}/file/delete?directory=${encodeURIComponent(sdk.directory)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: asset().path }),
                  })
                  setSelectedAsset(null)
                  setPending((list) => list.filter((item) => item.path !== asset().path))
                  await refetchAssets()
                }
              }}
            >
              Delete Asset
            </Button>
          </div>
          </div>
        </Show>
      )}
    </Show>
  )

  return (
    <ResizableSidebarLayout id={props.panel === "assets" ? "assets" : "design"} defaultWidth={208} disabled={compact()}>
      <AffordanceShell
        id={props.panel === "assets" ? "assets" : "design"}
        sidebarToggle={!compact()}
        padded={false}
        scroll={false}
        mainClass="design-content h-full"
        title={sections().find((s) => s.id === activeSection())?.label}
        query={isSearchable() ? searchQuery() : undefined}
        onQueryChange={isSearchable() ? setSearchQuery : undefined}
        searchPlaceholder={searchPlaceholder()}
        onRefresh={media(activeSection()) ? () => refetchAssets() : undefined}
        addLabel={addLabel()}
        onAdd={addLabel() ? onAdd : undefined}
        actions={headerActions()}
        sidebar={sidebar()}
        detail={detailSidebar()}
      >
        <Portal>
          <input id={uploadId} type="file" class="design-upload-input" accept={uploadAccept()} onChange={onUpload} />
        </Portal>

        <div class="flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto">
            <Show when={sectionLoading() && !contentLoading()}>
              <div class="design-loading-strip">
                <Spinner class="size-3.5 text-text-weaker" />
                <span>{loadingLabel()}</span>
              </div>
            </Show>
            <div
              class="section-content-enter mx-auto w-full"
              classList={{ "max-w-5xl": activeSection() !== "brand", "max-w-[72rem]": activeSection() === "brand" }}
            >
              <Show
                when={
                  (activeSection() === "brand" && brandSnapshot()) ||
                  (media(activeSection()) && filteredItems().length > 0) ||
                  (kit(activeSection()) && activeSection() !== "brand" && filteredItems().length > 0) ||
                  (activeSection() === "components" && components().length > 0) ||
                  (activeSection() === "tokens" && tokens().length > 0)
                }
                fallback={
                  <Show when={!contentLoading()} fallback={<ContentLoadingState label={loadingLabel()} />}>
                    <div class="py-20 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in-95 duration-300">
                      <div class="size-16 rounded-full bg-surface-raised-base flex items-center justify-center text-text-weaker">
                        {(() => {
                          const Icon = sections().find((s) => s.id === activeSection())?.icon
                          return <Icon class="size-8" />
                        })()}
                      </div>
                      <div class="text-center">
                        <div class="text-16-medium text-text-base mb-1">No {activeSection()} yet</div>
                        <div class="text-14-regular text-text-weaker max-w-[320px]">
                          {activeSection() === "brand" &&
                            "Seed defaults or open a project with Trellis initialized to create a project brand."}
                          {activeSection() === "icons" &&
                            "Enable icons from the Lucide or custom catalog for this project."}
                          {activeSection() === "colors" &&
                            "Create palettes with semantic roles like primary, surface, and accent."}
                          {activeSection() === "type" &&
                            "Add fonts from the curated catalog to build your project type system."}
                          {activeSection() === "assets" &&
                            "Images and visual media in .trellis/media will appear here."}
                          {activeSection() === "videos" &&
                            "Upload MP4, MOV, WebM, and other video files for your project."}
                          {activeSection() === "documents" &&
                            "Upload PDFs, Word docs, spreadsheets, and presentations."}
                          {activeSection() === "links" &&
                            "Save bookmarks and external URLs as reusable Trellis assets."}
                          {activeSection() === "models" && "Upload GLB, GLTF, OBJ, HDR, and other 3D or texture files."}
                          {activeSection() === "audio" && "Upload MP3, WAV, and other audio files for your project."}
                          {activeSection() === "sprites" &&
                            "Upload atlas PNGs to .trellis/media/sprites. Graph-backed regions and animations are defined in specs/sprite-atlas-graph.md."}
                          {activeSection() === "components" && "Components defined in your project will appear here."}
                          {activeSection() === "tokens" && "Centralize your styling with theme-aware tokens."}
                        </div>
                      </div>
                      <Show
                        when={
                          (uploadSection(activeSection()) ||
                            activeSection() === "links" ||
                            (kit(activeSection()) && activeSection() !== "brand") ||
                            activeSection() === "components" ||
                            activeSection() === "tokens") &&
                          activeSection() !== "brand"
                        }
                      >
                        <Show
                          when={uploadSection(activeSection())}
                          fallback={
                            <Button variant="secondary" type="button" class="mt-2" onClick={onAdd}>
                              Add your first{" "}
                              {activeSection() === "links"
                                ? "link"
                                : activeSection() === "type"
                                  ? "font"
                                  : activeSection() === "colors"
                                    ? "palette"
                                    : activeSection() === "icons"
                                      ? "icon"
                                      : activeSection().slice(0, -1)}
                            </Button>
                          }
                        >
                          <label
                            for={uploadId}
                            data-component="button"
                            data-variant="secondary"
                            class="design-upload-trigger mt-2"
                          >
                            Add your first asset
                          </label>
                        </Show>
                      </Show>
                    </div>
                  </Show>
                }
              >
                <Show when={activeSection() === "brand" && brandSnapshot()}>
                  {(snapshot) => (
                    <BrandGuide
                      snapshot={snapshot()}
                      logoUrl={snapshot().logoPath ? raw(snapshot().logoPath!) : undefined}
                      uploadingLogo={uploadingBrandLogo()}
                      savingSemantics={savingBrandSemantics()}
                      savingBrand={savingBrand()}
                      onUploadLogo={uploadBrandLogo}
                      onSaveSemantics={saveBrandSemantics}
                      onSaveName={saveBrandName}
                      onSaveSwatch={saveBrandSwatch}
                      onSaveFontFamily={saveBrandFontFamily}
                    />
                  )}
                </Show>

                <Show when={media(activeSection())}>
                  <div class="asset-grid">
                    <For each={visibleItems() as Asset[]}>
                      {(asset, idx) => (
                        <div
                          onClick={() => setSelectedAsset(asset)}
                          style={{ "animation-delay": `${idx() * 30}ms` }}
                          class="stagger-item asset-card group"
                          classList={{ selected: selectedAsset()?.path === asset.path }}
                        >
                          <div class="asset-preview">
                            <AssetPreview asset={asset} load={loadLinkPreviewFor} />
                          </div>
                          <div class="asset-info">
                            <Show
                              when={asset.category === "link" && asset.url}
                              fallback={
                                <div class="text-12-medium text-text-base truncate mb-0.5" title={label(asset)}>
                                  {label(asset)}
                                </div>
                              }
                            >
                              {(url) => (
                                <div class="mb-0.5">
                                  <LinkAssetTitle url={url()} title={label(asset)} load={loadLinkPreviewFor} />
                                </div>
                              )}
                            </Show>
                            <Show when={note(asset)}>
                              {(text) => (
                                <div class="text-10-regular text-text-weaker truncate mb-1" title={text()}>
                                  {text()}
                                </div>
                              )}
                            </Show>
                            <Show when={asset.category !== "link"}>
                              <div class="text-10-regular text-text-weaker flex items-center justify-between">
                                <span>{asset.ext.toUpperCase()}</span>
                                <span>{formatSize(asset.size)}</span>
                              </div>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={activeSection() === "icons"}>
                  <div class="icon-grid">
                    <For each={visibleItems() as Array<{ id: string; type: string }>}>
                      {(entity, idx) => (
                        <div style={{ "animation-delay": `${idx() * 25}ms` }} class="stagger-item icon-grid-card group">
                          <div class="icon-grid-preview">
                            <EntityIcon
                              type="Icon"
                              icon={String(
                                entityFact(designFacts(), entity.id, "catalogRef") ??
                                  entityFact(designFacts(), entity.id, "key") ??
                                  "thing",
                              )}
                              size={28}
                            />
                          </div>
                          <div
                            class="icon-grid-label truncate"
                            title={String(entityFact(designFacts(), entity.id, "key") ?? entity.id)}
                          >
                            {String(entityFact(designFacts(), entity.id, "key") ?? entity.id)}
                          </div>
                          <div class="icon-grid-meta truncate">
                            {String(entityFact(designFacts(), entity.id, "library") ?? "lucide")}
                          </div>
                          <IconButton
                            icon="trash"
                            variant="ghost"
                            class="icon-grid-delete opacity-0 group-hover:opacity-100"
                            onClick={() => void onDeleteEntity(entity.id)}
                            aria-label="Delete icon"
                          />
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show
                  when={
                    (kit(activeSection()) && activeSection() !== "brand" && activeSection() !== "icons") ||
                    activeSection() === "components" ||
                    activeSection() === "tokens"
                  }
                >
                  <div class="flex flex-col gap-2 p-6">
                    <For each={visibleItems() as Array<{ id: string; type: string }>}>
                      {(entity, idx) => (
                        <div
                          style={{ "animation-delay": `${idx() * 20}ms` }}
                          class="stagger-item flex items-center justify-between p-3 bg-surface-raised-base rounded-lg border border-border-weaker-base hover:border-border-base transition-all group"
                        >
                          <div class="flex items-center gap-3 min-w-0">
                            <div class="size-8 rounded bg-background-base flex items-center justify-center text-text-weak border border-border-weaker-base shrink-0">
                              <Show
                                when={activeSection() === "icons"}
                                fallback={
                                  <Show
                                    when={activeSection() === "colors"}
                                    fallback={
                                      <Show when={activeSection() === "type"} fallback={<Component class="size-4" />}>
                                        <Type class="size-4" />
                                      </Show>
                                    }
                                  >
                                    <Palette class="size-4" />
                                  </Show>
                                }
                              >
                                <EntityIcon
                                  type="Icon"
                                  icon={String(
                                    entityFact(designFacts(), entity.id, "catalogRef") ??
                                      entityFact(designFacts(), entity.id, "key") ??
                                      "thing",
                                  )}
                                  size={16}
                                />
                              </Show>
                            </div>
                            <div class="min-w-0">
                              <div class="text-13-medium text-text-base truncate">
                                <Show
                                  when={activeSection() === "icons"}
                                  fallback={
                                    <Show
                                      when={activeSection() === "colors"}
                                      fallback={
                                        <Show
                                          when={activeSection() === "type"}
                                          fallback={
                                            designFacts().find((f) => f.e === entity.id && f.a === "label")?.v as string
                                          }
                                        >
                                          {String(entityFact(designFacts(), entity.id, "family") ?? entity.id)}
                                        </Show>
                                      }
                                    >
                                      {String(entityFact(designFacts(), entity.id, "name") ?? entity.id)}
                                    </Show>
                                  }
                                >
                                  {String(entityFact(designFacts(), entity.id, "key") ?? entity.id)}
                                  <span class="text-text-weaker">
                                    {" "}
                                    · {String(entityFact(designFacts(), entity.id, "library") ?? "lucide")}
                                  </span>
                                </Show>
                              </div>
                              <div class="text-11-regular text-text-weaker truncate">{entity.id}</div>
                              <Show when={activeSection() === "colors"}>
                                <div class="flex items-center gap-1 mt-1">
                                  <For
                                    each={Object.values(
                                      parseJsonFact<Record<string, string>>(
                                        entityFact(designFacts(), entity.id, "swatches"),
                                        {},
                                      ),
                                    ).slice(0, 6)}
                                  >
                                    {(color) => (
                                      <span
                                        class="size-3 rounded-full border border-border-weaker-base"
                                        style={{ "background-color": color }}
                                      />
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </div>
                          <IconButton
                            icon="trash-2"
                            variant="ghost"
                            size="small"
                            class="opacity-0 group-hover:opacity-100 transition-opacity text-text-destructive"
                            onClick={() => onDeleteEntity(entity.id)}
                          />
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={hiddenItemCount() > 0}>
                  <div class="flex justify-center px-6 pb-8">
                    <Button variant="secondary" onClick={() => setVisibleLimit((limit) => limit + CONTENT_BATCH)}>
                      Show {Math.min(CONTENT_BATCH, hiddenItemCount())} more
                    </Button>
                  </div>
                </Show>
              </Show>
            </div>
        </div>

        <IconPickerDialog
          open={iconPickerOpen()}
          value=""
          color="#818cf8"
          type="Icon"
          onClose={() => setIconPickerOpen(false)}
          onSelect={async (icon) => {
            setIconPickerOpen(false)
            const facts = iconEntityFacts(icon)
            if (!facts) return
            const result = await store.assert(facts)
            if (result) await refetchDesignInventory()
            showToast(result ? { title: "Icon added" } : { variant: "error", title: "Failed to add icon" })
          }}
        />
      </AffordanceShell>
    </ResizableSidebarLayout>
  )
}

export function AssetsPanel(props: { section?: MediaSection } = {}) {
  return (
    <TrellisStoreScope>
      <Inner panel="assets" section={props.section} />
    </TrellisStoreScope>
  )
}

export function DesignPanel(props: { section?: DesignKitSection } = {}) {
  return (
    <TrellisStoreScope>
      <Inner panel="design" section={props.section} />
    </TrellisStoreScope>
  )
}
