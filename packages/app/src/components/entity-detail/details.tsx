import { createMemo, createResource, createSignal, For, Match, Show, Switch } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { useTrellis, type TrellisRef } from "@/context/trellis"
import { useSDK } from "@/context/sdk"
import { useEntityNavigate } from "./nav"
import { FileFrontmatterSection } from "./file-frontmatter-section"
import { OMIT_FACT_KEYS, short, show, leaf, ext, isMd } from "./helpers"
import { ENTITY_COLORS } from "@/lib/entity-theme"

type Chip = { label: string; value: string | undefined }

type FileStat = {
  size: number
  created: number
  modified: number
  permissions: string
  isDirectory: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function EntityDetails(props: {
  id: string
  type: string | undefined
  status?: string | null
  priority?: string | null
}) {
  const trellis = useTrellis()
  const sdk = useSDK()
  const navigate = useEntityNavigate()

  const path = createMemo(() => short(props.id))
  const isFile = createMemo(() => props.type === "file" || props.type === "directory")

  const [ent] = createResource(
    () => props.id,
    async (next) => {
      try {
        return await trellis.fetchEntity(next)
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )
  const [refs] = createResource(
    () => props.id,
    async (next) => {
      try {
        return await trellis.fetchRefs(next)
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )

  // Fetch file stats for file/directory entities
  const [stat] = createResource(
    () => (isFile() ? path() : null),
    async (p) => {
      if (!p) return undefined
      try {
        // Use a direct fetch to get file metadata
        const dir = sdk.directory
        const resp = await sdk.fetch(`/file/list?path=${encodeURIComponent(p)}`)
        if (!resp.ok) return undefined
        const data = await resp.json()
        // If listing a directory, we get the children - find the exact match
        const item = data?.find((n: any) => n.path === p || n.name === leaf(p))
        if (!item) return undefined

        // Try to get actual stats via a raw stat call
        try {
          const statResp = await sdk.fetch(`/file/raw?path=${encodeURIComponent(p)}&stat=1`)
          if (statResp.ok) {
            const statData = await statResp.json()
            return statData as FileStat
          }
        } catch {
          // Fallback: no detailed stats available
        }
        return undefined
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )

  const entity = () => ent.latest
  const rels = () => refs.latest
  const info = () => stat.latest
  const facts = createMemo(() => (entity()?.facts ?? []).filter((f) => !OMIT_FACT_KEYS.has(f.a)))
  const links = createMemo(() => entity()?.links ?? [])
  const chips = createMemo<Chip[]>(() => {
    const out: Chip[] = []
    if (props.status) out.push({ label: "status", value: props.status })
    if (props.priority) out.push({ label: "priority", value: props.priority })
    return out
  })
  const empty = createMemo(
    () =>
      !ent.loading &&
      !refs.loading &&
      facts().length === 0 &&
      links().length === 0 &&
      (rels()?.outgoing?.length ?? 0) === 0 &&
      (rels()?.incoming?.length ?? 0) === 0 &&
      chips().length === 0 &&
      !isFile(),
  )

  return (
    <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-4">
      {/* File/Directory Metadata Card */}
      <Show when={isFile()}>
        <FileMetadataCard path={path()} type={props.type} stat={info()} />
      </Show>

      <Show when={props.type === "file" && isMd(path())}>
        <FileFrontmatterSection path={path()} />
      </Show>

      <Show when={chips().length > 0}>
        <div class="flex flex-wrap gap-1.5">
          <For each={chips()}>
            {(chip) => (
              <span class="rounded-full bg-background-base px-2 py-0.5 text-10-medium text-text-weak">
                {chip.label}: {chip.value}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={ent.loading}>
        <div class="flex items-center justify-center py-6">
          <div class="animate-spin h-4 w-4 rounded-full border-2 border-text-weaker border-t-transparent" />
        </div>
      </Show>

      <Show when={facts().length > 0}>
        <Section icon="tag" title="Attributes">
          <table class="w-full text-left border-collapse">
            <tbody>
              <For each={facts().slice(0, 32)}>{(f) => <FactRow entityId={props.id} fact={f} />}</For>
            </tbody>
          </table>
        </Section>
      </Show>

      <Show when={links().length > 0}>
        <Section icon="arrow-right" title="Links">
          <div class="grid grid-cols-2 gap-2">
            <For each={links().slice(0, 24)}>
              {(l) => <LinkCard relation={l.a} target={l.e2} onClick={() => navigate(l.e2)} />}
            </For>
          </div>
        </Section>
      </Show>

      <Show when={(rels()?.outgoing?.length ?? 0) > 0}>
        <Section icon="link" title="References">
          <div class="grid grid-cols-2 gap-2">
            <For each={rels()?.outgoing ?? []}>
              {(r) => {
                const target = `${r.namespace}:${r.target}`
                const open = r.state === "resolved" && !!r.namespace && !!r.target
                return (
                  <ReferenceCard
                    title={r.title ?? target}
                    namespace={r.namespace}
                    state={r.state}
                    staleReason={r.staleReason}
                    onClick={() => open && navigate(target, r.namespace)}
                    disabled={!open}
                  />
                )
              }}
            </For>
          </div>
        </Section>
      </Show>

      <Show when={(rels()?.incoming?.length ?? 0) > 0}>
        <Section icon="arrow-left" title="Backlinks">
          <div class="grid grid-cols-1 gap-2">
            <For each={rels()?.incoming ?? []}>{(b) => <BacklinkCard filePath={b.filePath} line={b.line} />}</For>
          </div>
        </Section>
      </Show>

      <Show when={empty()}>
        <div class="rounded-md border border-border-base/60 bg-background-base px-3 py-4 text-12-regular text-text-weak text-center">
          No details available
        </div>
      </Show>
    </div>
  )
}

function FactRow(props: { entityId: string; fact: { a: string; v: unknown } }) {
  const trellis = useTrellis()
  const [editing, setEditing] = createSignal(false)
  const [val, setVal] = createSignal(show(props.fact.v))
  const [busy, setBusy] = createSignal(false)

  const save = async () => {
    if (busy()) return
    const next = val().trim()
    const old = show(props.fact.v)
    if (next === old) {
      setEditing(false)
      return
    }
    setBusy(true)
    await trellis.retractFacts([{ e: props.entityId, a: props.fact.a, v: old }])
    await trellis.assertFacts([{ e: props.entityId, a: props.fact.a, v: next }])
    setBusy(false)
    setEditing(false)
  }

  const cancel = () => {
    setVal(show(props.fact.v))
    setEditing(false)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void save()
    }
    if (e.key === "Escape") cancel()
  }

  return (
    <tr class="border-b border-border-weaker-base">
      <td class="py-1.5 px-2 text-10-medium uppercase tracking-wide text-text-weaker w-32 shrink-0 align-top">
        {props.fact.a}
      </td>
      <td class="py-1.5 px-2 text-11-regular text-text-strong align-top">
        <Show
          when={editing()}
          fallback={
            <button
              class="text-left w-full hover:bg-surface-raised-base/50 rounded px-1 -mx-1 transition-colors"
              classList={{ "opacity-50": busy() }}
              onClick={() => setEditing(true)}
              disabled={busy()}
            >
              {show(props.fact.v)}
            </button>
          }
        >
          <input
            class="w-full bg-background-base border border-border-base rounded px-1.5 py-0.5 text-11-regular text-text-strong outline-none focus:border-border-weak-base"
            value={val()}
            onInput={(e) => setVal(e.currentTarget.value)}
            onBlur={() => void save()}
            onKeyDown={onKey}
            autofocus
          />
        </Show>
      </td>
    </tr>
  )
}

export function Section(props: { icon: string; title: string; children: any }) {
  return (
    <div class="flex flex-col gap-2">
      <div class="text-11-semibold uppercase tracking-wide text-text-weak flex items-center gap-1.5">
        <Icon name={props.icon as any} size="small" />
        {props.title}
      </div>
      <div class="flex flex-col gap-1.5">{props.children}</div>
    </div>
  )
}

function RefStateIcon(props: { state: TrellisRef["state"] }) {
  if (props.state === "resolved") return <span class="w-2 h-2 rounded-full bg-text-success shrink-0 mt-1" />
  if (props.state === "stale") {
    return <Icon name="alert-triangle" size="small" class="shrink-0 text-text-warning mt-0.5" />
  }
  return <Icon name="x-circle" size="small" class="shrink-0 text-text-danger mt-0.5" />
}

// Card Components

function FileMetadataCard(props: { path: string; type: string | undefined; stat: FileStat | undefined }) {
  const accent = () => ENTITY_COLORS[props.type ?? "file"] ?? "var(--border-base)"
  const extension = () => ext(props.path)

  return (
    <div
      class="group relative flex flex-col overflow-hidden rounded-md border border-border-base/60 bg-background-base text-left"
      style={{ "--accent": accent() }}
    >
      {/* Header with icon and name */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base">
        <FileIcon
          node={{ path: props.path, type: props.type === "directory" ? "directory" : "file" }}
          class="shrink-0 size-4"
        />
        <span class="text-13-medium text-text-strong truncate flex-1" title={props.path}>
          {leaf(props.path)}
        </span>
        <Show when={extension()}>
          <span
            class="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(255,255,255,0.1)", color: "var(--text-weaker)" }}
          >
            {extension()}
          </span>
        </Show>
      </div>

      {/* Metadata grid */}
      <div class="grid grid-cols-2 gap-px bg-border-base/30">
        <Show
          when={props.stat}
          fallback={<div class="col-span-2 px-3 py-2 text-11-regular text-text-weaker italic">Loading metadata...</div>}
        >
          {(s) => (
            <>
              <MetadataItem label="Size" value={formatBytes(s().size)} />
              <MetadataItem label="Type" value={s().isDirectory ? "Directory" : "File"} />
              <MetadataItem label="Created" value={formatDate(s().created)} />
              <MetadataItem label="Modified" value={formatDate(s().modified)} />
              <MetadataItem label="Permissions" value={s().permissions} />
            </>
          )}
        </Show>
      </div>
    </div>
  )
}

function MetadataItem(props: { label: string; value: string }) {
  return (
    <div class="bg-background-base px-3 py-2 flex flex-col gap-0.5">
      <span class="text-[9px] uppercase tracking-wide text-text-weaker">{props.label}</span>
      <span class="text-11-medium text-text-strong truncate" title={props.value}>
        {props.value}
      </span>
    </div>
  )
}

export function LinkCard(props: { relation: string; target: string; onClick: () => void }) {
  const targetType = () => {
    if (props.target.startsWith("file:")) return "file"
    if (props.target.startsWith("dir:")) return "directory"
    if (props.target.startsWith("issue:")) return "issue"
    return "entity"
  }
  const accent = () => ENTITY_COLORS[targetType()] ?? "var(--border-base)"

  return (
    <button
      class="group relative flex flex-col overflow-hidden rounded-md border border-border-base/60 bg-background-base text-left hover:border-border-base hover:bg-surface-raised-base/40 transition-colors"
      style={{ "--accent": accent() }}
      onClick={props.onClick}
    >
      <div class="flex items-start gap-2 px-2.5 py-2">
        <span
          class="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
          style={{ background: accent() + "20", color: accent() }}
        >
          {props.relation}
        </span>
        <span class="text-11-medium text-text-strong font-mono truncate flex-1" title={short(props.target)}>
          {short(props.target)}
        </span>
      </div>
    </button>
  )
}

export function ReferenceCard(props: {
  title: string
  namespace?: string
  state: TrellisRef["state"]
  staleReason?: string
  onClick: () => void
  disabled: boolean
}) {
  const stateColor = () => {
    if (props.state === "resolved") return "rgb(34, 197, 94)"
    if (props.state === "stale") return "rgb(245, 158, 11)"
    return "rgb(239, 68, 68)"
  }

  return (
    <button
      class="group relative flex flex-col overflow-hidden rounded-md border border-border-base/60 bg-background-base text-left transition-colors"
      classList={{
        "hover:border-border-base hover:bg-surface-raised-base/40 cursor-pointer": !props.disabled,
        "cursor-default opacity-70": props.disabled,
      }}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <div class="flex items-start gap-2 px-2.5 py-2">
        <span
          class="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
          style={{ background: stateColor() + "20", color: stateColor() }}
        >
          {props.namespace ?? "ref"}
        </span>
        <div class="flex-1 min-w-0">
          <span class="text-11-medium text-text-strong font-mono truncate block" title={props.title}>
            {props.title}
          </span>
          <Show when={props.state !== "resolved"}>
            <span class="text-10-regular text-text-warning capitalize">
              {props.state}
              {props.staleReason ? ` (${props.staleReason})` : ""}
            </span>
          </Show>
        </div>
        <RefStateIcon state={props.state} />
      </div>
    </button>
  )
}

export function BacklinkCard(props: { filePath: string; line: number }) {
  return (
    <div class="flex flex-col overflow-hidden rounded-md border border-border-base/60 bg-background-base px-2.5 py-2">
      <div class="flex items-center gap-2">
        <Icon name="link" size="small" class="shrink-0 text-icon-weak" />
        <span class="text-11-medium text-text-strong font-mono truncate flex-1" title={props.filePath}>
          {props.filePath}
        </span>
        <span
          class="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: "rgba(59,130,246,0.15)", color: "rgb(59,130,246)" }}
        >
          L{props.line}
        </span>
      </div>
    </div>
  )
}
