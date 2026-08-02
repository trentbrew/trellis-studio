import { lazy, Suspense } from "solid-js"
import type { ProjectionDefinition } from "@/lib/projections/types"
import type { MediaSection } from "@/pages/session/design-panel"

const AssetsPanel = lazy(() =>
  import("@/pages/session/design-panel").then((module) => ({ default: module.AssetsPanel })),
)

function resolveSection(projection: ProjectionDefinition): MediaSection {
  const q = projection.query
  if (q.kind !== "assets") return "assets"
  const cats = q.category ?? []
  if (cats.includes("audio")) return "audio"
  if (cats.includes("links")) return "links"
  if (cats.includes("video")) return "videos"
  if (cats.includes("document")) return "documents"
  if (cats.includes("model3d") || cats.includes("texture")) return "models"
  if (cats.includes("sprites") || cats.includes("sprite") || cats.includes("spritesheet")) return "sprites"
  return "assets"
}

export function AssetsProjection(props: { projection: ProjectionDefinition }) {
  const section = resolveSection(props.projection)
  return (
    <Suspense
      fallback={<div class="flex h-full items-center justify-center text-12-regular text-text-weaker">Loading…</div>}
    >
      <AssetsPanel section={section} />
    </Suspense>
  )
}
