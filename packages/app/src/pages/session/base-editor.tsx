import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useFile } from "@/context/file"
import {
  RouteContent,
  RouteEmptyState,
  RouteHeader,
  RoutePanel,
  RouteView,
} from "@/components/route"
import { Spinner } from "@opencode-ai/ui/spinner"
import { parseBase } from "@/lib/obsidian-base/parse"
import { combineFilters } from "@/lib/obsidian-base/parse"
import { applyFilter, readProperty, sortNotes } from "@/lib/obsidian-base/filter"
import { walkVault, type DirectoryListing, type LoadedNote } from "@/lib/obsidian-base/notes"
import { invalidateVaultCache, loadVaultCached, peekVaultCache } from "@/lib/obsidian-base/vault-cache"
import { useWorkspaceFileWatcher } from "@/hooks/use-workspace-file-watcher"
import type { BaseSpec, BaseView, NoteRecord } from "@/lib/obsidian-base/types"
import { isLinkMarker } from "@/lib/obsidian-base/types"

const MARKDOWN_PATH = /\.(md|markdown|mdx)$/i

export function BaseEditor(props: {
  path: string
  value: string
  active: boolean
  onOpenNote?: (path: string) => void
}) {
  const sdk = useSDK()
  const file = useFile()

  const spec = createMemo<{ ok: true; spec: BaseSpec } | { ok: false; error: string }>(() => {
    try {
      return { ok: true as const, spec: parseBase(props.value) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  const [activeView, setActiveView] = createSignal(0)
  const vaultGeneration = useWorkspaceFileWatcher({
    match: (path) => MARKDOWN_PATH.test(path),
  })

  createEffect(() => {
    vaultGeneration()
    invalidateVaultCache(sdk.directory)
  })

  const [notes] = createResource(
    () => [sdk.directory, vaultGeneration()] as const,
    async ([directory]) => loadVaultCached(directory, () => loadVault(sdk)),
    { initialValue: peekVaultCache(sdk.directory) },
  )

  const filtered = createMemo<NoteRecord[]>(() => {
    const sx = spec()
    if (!sx.ok) return []
    const all = notes() ?? []
    const view = sx.spec.views[activeView()] ?? sx.spec.views[0]
    const combined = combineFilters(sx.spec.filters, view?.filters)
    const result = applyFilter(all, combined)
    return sortNotes(result, view?.order)
  })

  const columns = createMemo<{ key: string; label: string }[]>(() => {
    const sx = spec()
    if (!sx.ok) return []
    const view = sx.spec.views[activeView()] ?? sx.spec.views[0]
    const order = view?.order ?? Object.keys(sx.spec.properties)
    const fallback = order.length > 0 ? order : ["file.name"]
    return fallback.map((key) => ({
      key,
      label: sx.spec.properties[key]?.displayName ?? humanize(key.replace(/^(file|note)\./, "")),
    }))
  })

  const openNote = (path: string) => {
    if (props.onOpenNote) {
      props.onOpenNote(path)
      return
    }
    const tab = file.tab(path)
    void file.load(path)
  }

  return (
    <RouteView class="h-full">
      <RoutePanel class="route-panel--compact h-full">
        <Show
          when={spec().ok}
          fallback={
            <RouteContent>
              <RouteEmptyState
                title="Could not parse this .base file"
                description={
                  spec().ok ? "" : (spec() as { ok: false; error: string }).error
                }
              />
            </RouteContent>
          }
        >
          <RouteHeader
            title={fileTitle(props.path)}
            meta={
              <span>
                {filtered().length}
                {" "}
                {filtered().length === 1 ? "result" : "results"}
              </span>
            }
            actions={
              <Show when={(spec() as { ok: true; spec: BaseSpec }).spec.views.length > 1}>
                <div class="flex items-center rounded-md border border-border-weaker-base overflow-hidden bg-transparent">
                  <For each={(spec() as { ok: true; spec: BaseSpec }).spec.views}>
                    {(view, i) => (
                      <button
                        type="button"
                        class={`px-3 h-7 text-12-medium transition-colors ${i() === activeView() ? "text-text-strong shadow-[inset_0_-1px_0_0_var(--text-strong)]" : "text-text-weak hover:text-text-base"}`}
                        onClick={() => setActiveView(i())}
                      >
                        {view.name}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            }
          />
          <RouteContent scroll>
            <Show
              when={!notes.loading}
              fallback={
                <div class="flex h-32 items-center justify-center">
                  <Spinner />
                </div>
              }
            >
              <Show
                when={filtered().length > 0}
                fallback={
                  <RouteEmptyState
                    title="No matching notes"
                    description="No notes in the vault match this base's filters."
                  />
                }
              >
                <BaseTable
                  rows={filtered()}
                  columns={columns()}
                  layout={(spec() as { ok: true; spec: BaseSpec }).spec.views[activeView()]?.type ?? "table"}
                  onOpen={openNote}
                />
              </Show>
            </Show>
          </RouteContent>
        </Show>
      </RoutePanel>
    </RouteView>
  )
}

function BaseTable(props: {
  rows: NoteRecord[]
  columns: { key: string; label: string }[]
  layout: BaseView["type"]
  onOpen: (path: string) => void
}) {
  return (
    <Show
      when={props.layout !== "cards"}
      fallback={
        <div class="grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          <For each={props.rows}>
            {(row) => (
              <button
                type="button"
                class="flex flex-col gap-2 rounded-md border border-border-weaker-base bg-transparent p-3 text-left hover:bg-surface-raised-base-hover"
                onClick={() => props.onOpen(row.file.path)}
              >
                <div class="text-13-medium text-text-strong">{row.file.basename}</div>
                <For each={props.columns.filter((c) => c.key !== "file.name")}>
                  {(col) => (
                    <div class="flex items-center justify-between gap-2 text-12-regular">
                      <span class="text-text-weak">{col.label}</span>
                      <span class="text-text-base truncate">{formatCell(readProperty(row, col.key))}</span>
                    </div>
                  )}
                </For>
              </button>
            )}
          </For>
        </div>
      }
    >
      <div class="overflow-auto">
        <table class="w-full border-collapse text-13-regular">
          <thead class="sticky top-0 bg-surface-base">
            <tr>
              <For each={props.columns}>
                {(col) => (
                  <th class="border-b border-border-weaker-base px-3 py-2 text-left text-12-medium text-text-weak">
                    {col.label}
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr
                  class="cursor-pointer border-b border-border-weaker-base hover:bg-surface-raised-base-hover"
                  onClick={() => props.onOpen(row.file.path)}
                >
                  <For each={props.columns}>
                    {(col) => (
                      <td class="px-3 py-2 align-top text-text-base">
                        <Show when={col.key === "file.name"} fallback={<span>{formatCell(readProperty(row, col.key))}</span>}>
                          <span class="text-text-strong">{row.file.basename}</span>
                        </Show>
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  )
}

async function loadVault(sdk: ReturnType<typeof useSDK>): Promise<NoteRecord[]> {
  const listDir = async (dir: string): Promise<DirectoryListing[]> => {
    const res = await sdk.client.file.list({ path: dir })
    return (res.data ?? []).map((n) => ({ path: n.path, type: n.type, ignored: n.ignored }))
  }
  const readFile = async (path: string): Promise<LoadedNote | undefined> => {
    try {
      const res = await sdk.client.file.read({ path })
      const data = res.data
      if (!data || data.type !== "text") return undefined
      return { path, content: data.content }
    } catch {
      return undefined
    }
  }
  return walkVault("", { listDir, readFile })
}

function fileTitle(path: string): string {
  const name = path.split("/").pop() ?? path
  return name.replace(/\.base$/i, "")
}

function humanize(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (isLinkMarker(value)) return value.display ?? value.target
  if (Array.isArray(value)) return value.map(formatCell).join(", ")
  if (value instanceof Date) return value.toLocaleDateString()
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export const isBasePath = (p: string | undefined): boolean => !!p && /\.base$/i.test(p)
