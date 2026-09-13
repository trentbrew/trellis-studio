import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { EntityPreviewCard } from "@/components/entity-preview-card"
import { entityFromHref } from "@opencode-ai/ui/lib/entity-ref"
import { entityPreviewFromFacts, type EntityPreviewData } from "@/lib/entity-summary"
import { entityMarkdownPath, inlineBody, markdownBody, snippet } from "@/lib/entity-body-path"
import { entityTypeFromId } from "@/lib/entity-theme"
import { useTrellisOptional } from "@/context/trellis"
import { useTrellisStoreOptional } from "@/context/trellis-store"
import { useSDK } from "@/context/sdk"

const cache = new Map<string, EntityPreviewData>()

function wikiTarget(href: string) {
  if (href.startsWith("entity://")) return decodeURIComponent(href.slice("entity://".length))
  if (!href.startsWith("wiki://")) return undefined
  const rest = href.slice("wiki://".length)
  const slash = rest.indexOf("/")
  const ns = slash === -1 ? rest : rest.slice(0, slash)
  const target = decodeURIComponent(slash === -1 ? "" : rest.slice(slash + 1))
  if (ns === "entity") return target
  if (ns === "issue") return `issue:${target.toUpperCase()}`
  if (ns === "decision") return `decision:${target.toUpperCase()}`
  if (ns === "file") return `file:${target}`
  return `${ns}:${target}`
}

function mentionId(el: HTMLElement) {
  const id = el.getAttribute("data-mention-id")
  const type = el.getAttribute("data-mention-type")
  if (!id || type === "file") return undefined
  return id
}

export function EntityLinkHoverLayer() {
  const trellis = useTrellisOptional()
  const store = useTrellisStoreOptional()
  const sdk = useSDK()
  const [preview, setPreview] = createSignal<{ data: EntityPreviewData; rect: DOMRect } | undefined>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  const lookup = async (id: string) => {
    const cached = cache.get(id)
    if (cached) return cached
    if (id.startsWith("issue:")) {
      const issueId = id.slice("issue:".length)
      const issue = await trellis?.getIssue(issueId)
      if (issue) {
        const text = issue.description?.trim()
        const data = {
          id,
          type: "issue",
          title: issue.title || issueId,
          subtitle: issue.status,
          snippet: text ? (text.length > 160 ? `${text.slice(0, 157)}…` : text) : undefined,
        }
        cache.set(id, data)
        return data
      }
    }
    const facts = store?.facts.filter((fact) => fact.e === id) ?? []
    if (facts.length) {
      const data = entityPreviewFromFacts(id, facts)
      const direct = inlineBody(facts)
      if (direct) {
        data.snippet = snippet(direct)
        cache.set(id, data)
        return data
      }
      const path = entityMarkdownPath(facts)
      if (path) {
        const result = await sdk.client.file.read({ path }).catch(() => undefined)
        const file = result?.data
        if (file?.type === "text" && file.encoding !== "base64") {
          const body = markdownBody(file.content)
          if (body) data.snippet = snippet(body)
        }
      }
      cache.set(id, data)
      return data
    }
    const entity = await trellis?.fetchEntity(id)
    if (entity?.facts?.length) {
      const data = entityPreviewFromFacts(id, entity.facts)
      const direct = inlineBody(entity.facts)
      if (direct) {
        data.snippet = snippet(direct)
        cache.set(id, data)
        return data
      }
      const path = entityMarkdownPath(entity.facts)
      if (path) {
        const result = await sdk.client.file.read({ path }).catch(() => undefined)
        const file = result?.data
        if (file?.type === "text" && file.encoding !== "base64") {
          const body = markdownBody(file.content)
          if (body) data.snippet = snippet(body)
        }
      }
      cache.set(id, data)
      return data
    }
    const type = entityTypeFromId(id)
    const data = { id, type, title: id.split(":").slice(1).join(":") || id }
    cache.set(id, data)
    return data
  }

  const show = async (id: string, rect: DOMRect) => {
    const data = await lookup(id)
    if (!data) return
    setPreview({ data, rect })
  }

  const hide = () => {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => setPreview(undefined), 120)
  }

  onMount(() => {
    const over = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const link = target?.closest?.("a.wiki-link, a.entity-link") as HTMLAnchorElement | null
      const mention = target?.closest?.(".mention-node") as HTMLElement | null
      const el = link ?? mention
      if (!el) {
        hide()
        return
      }
      const id = link ? wikiTarget(link.getAttribute("href") ?? "") ?? entityFromHref(link.href) : mentionId(el)
      if (!id) return
      const rect = el.getBoundingClientRect()
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void show(id, rect), 280)
    }

    const out = (event: MouseEvent) => {
      const related = event.relatedTarget as HTMLElement | null
      if (related?.closest?.("[data-entity-link-hover]")) return
      if (related?.closest?.("a.wiki-link, a.entity-link, .mention-node")) return
      if (timer) clearTimeout(timer)
      hide()
    }

    document.addEventListener("mouseover", over, true)
    document.addEventListener("mouseout", out, true)
    onCleanup(() => {
      document.removeEventListener("mouseover", over, true)
      document.removeEventListener("mouseout", out, true)
      if (timer) clearTimeout(timer)
      if (hideTimer) clearTimeout(hideTimer)
    })
  })

  return (
    <Show when={preview()}>
      {(current) => {
        const gap = 8
        const width = 288
        const left = Math.min(current().rect.left, window.innerWidth - width - 16)
        const below = window.innerHeight - current().rect.bottom - gap
        const top = below > 180 ? current().rect.bottom + gap : undefined
        const bottom = below > 180 ? undefined : window.innerHeight - current().rect.top + gap
        return (
          <div
            data-entity-link-hover=""
            class="pointer-events-none"
            style={{
              position: "fixed",
              left: `${left}px`,
              width: `${width}px`,
              top: top !== undefined ? `${top}px` : undefined,
              bottom: bottom !== undefined ? `${bottom}px` : undefined,
              "z-index": "9999",
            }}
          >
            <EntityPreviewCard data={current().data} compact />
          </div>
        )
      }}
    </Show>
  )
}
