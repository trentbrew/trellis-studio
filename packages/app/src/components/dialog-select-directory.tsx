import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { List } from "@opencode-ai/ui/list"
import type { ListRef } from "@opencode-ai/ui/list"
import { showToast } from "@opencode-ai/ui/toast"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { createMemo, createResource, createSignal } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import {
  createDirectorySearch,
  trimTrailingDirectory,
  turtlecodeDirCacheHas,
} from "@/lib/turtlecode-directory-list"

interface DialogSelectDirectoryProps {
  title?: string
  multiple?: boolean
  onSelect: (result: string | string[] | null) => void
}

type Row = {
  absolute: string
  search: string
  group: "create" | "path" | "recent" | "folders"
}

const CLONE_KEY = "__clone__"
const CREATE_KEY = "__create__"

function cleanInput(value: string) {
  const first = (value ?? "").split(/\r?\n/)[0] ?? ""
  return first.replace(/[\u0000-\u001F\u007F]/g, "").trim()
}

function normalizePath(input: string) {
  const v = input.replaceAll("\\", "/")
  if (v.startsWith("//") && !v.startsWith("///")) return "//" + v.slice(2).replace(/\/+/g, "/")
  return v.replace(/\/+/g, "/")
}

function normalizeDriveRoot(input: string) {
  const v = normalizePath(input)
  if (/^[A-Za-z]:$/.test(v)) return v + "/"
  return v
}

function trimTrailing(input: string) {
  return trimTrailingDirectory(input)
}

function rootOf(input: string) {
  const v = normalizeDriveRoot(input)
  if (v.startsWith("//")) return "//"
  if (v.startsWith("/")) return "/"
  if (/^[A-Za-z]:\//.test(v)) return v.slice(0, 3)
  return ""
}

function modeOf(input: string) {
  const raw = normalizeDriveRoot(input.trim())
  if (!raw) return "relative" as const
  if (raw.startsWith("~")) return "tilde" as const
  if (rootOf(raw)) return "absolute" as const
  return "relative" as const
}

function resolveInputPath(input: string, home: string) {
  const value = cleanInput(input)
  if (!value) return undefined

  const mode = modeOf(value)
  if (mode === "relative") return undefined

  const raw = normalizeDriveRoot(value)
  if (mode === "tilde") {
    if (!home) return undefined
    if (raw === "~") return trimTrailing(home)
    if (raw.startsWith("~/")) return trimTrailing(home + raw.slice(1))
    return undefined
  }

  return trimTrailing(raw)
}

function groupRank(category: string) {
  if (category === "create") return 0
  if (category === "path") return 1
  if (category === "recent") return 2
  return 3
}

function tildeOf(absolute: string, home: string) {
  const full = trimTrailing(absolute)
  if (!home) return ""

  const hn = trimTrailing(home)
  const lc = full.toLowerCase()
  const hc = hn.toLowerCase()
  if (lc === hc) return "~"
  if (lc.startsWith(hc + "/")) return "~" + full.slice(hn.length)
  return ""
}

function displayPath(path: string, input: string, home: string) {
  const full = trimTrailing(path)
  if (modeOf(input) === "absolute") return full
  return tildeOf(full, home) || full
}

function toRow(absolute: string, home: string, group: Row["group"]): Row {
  const full = trimTrailing(absolute)
  const tilde = tildeOf(full, home)
  const withSlash = (value: string) => {
    if (!value) return ""
    if (value.endsWith("/")) return value
    return value + "/"
  }

  const search = Array.from(
    new Set([full, withSlash(full), tilde, withSlash(tilde), getFilename(full)].filter(Boolean)),
  ).join("\n")
  return { absolute: full, search, group }
}

function pathRow(absolute: string, value: string, home: string): Row {
  const label = displayPath(absolute, value, home)
  return {
    absolute,
    search: [value, absolute, label, getFilename(absolute)].filter(Boolean).join("\n"),
    group: "path",
  }
}

function uniqueRows(rows: Row[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (row.absolute === CREATE_KEY || row.absolute === CLONE_KEY) return true
    if (seen.has(row.absolute)) return false
    seen.add(row.absolute)
    return true
  })
}

function shouldListFolders(value: string, home: string) {
  const query = cleanInput(value)
  if (!query) return false
  const pasted = resolveInputPath(query, home)
  if (pasted && modeOf(query) !== "relative") return false
  return true
}

export function DialogSelectDirectory(props: DialogSelectDirectoryProps) {
  const sync = useGlobalSync()
  const sdk = useGlobalSDK()
  const server = useServer()
  const dialog = useDialog()
  const language = useLanguage()

  const [filter, setFilter] = createSignal("")
  let list: ListRef | undefined

  const missingBase = createMemo(() => !sync.data.path.home)
  const [fallbackPath] = createResource(
    () => (missingBase() ? true : undefined),
    async () => {
      return sdk.client.path
        .get()
        .then((x) => x.data)
        .catch(() => undefined)
    },
    { initialValue: undefined },
  )

  const home = createMemo(() => sync.data.path.home || fallbackPath.latest?.home || "")
  const start = createMemo(() => {
    const h = home()
    return h ? trimTrailing(`${h}/.turtlecode`) : ""
  })

  const directories = createDirectorySearch(sdk.client, start)

  const createRow: Row = {
    absolute: CREATE_KEY,
    search: language.t("dialog.directory.create") + "\nnew blank project",
    group: "create",
  }

  const cloneRow: Row = {
    absolute: CLONE_KEY,
    search: language.t("dialog.clone.title") + "\nclone github import",
    group: "create",
  }

  const recentRows = createMemo(() => {
    const h = home()
    const seen = new Set<string>()
    const out: Row[] = []

    const add = (worktree: string) => {
      const absolute = trimTrailing(worktree)
      if (!absolute || seen.has(absolute)) return
      seen.add(absolute)
      out.push(toRow(absolute, h, "recent"))
    }

    for (const project of server.projects.list()) {
      add(project.worktree)
    }

    const sorted = sync.data.project
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    for (const project of sorted) {
      if (project.worktree) add(project.worktree)
    }

    return out.slice(0, 20)
  })

  const buildStaticRows = (value: string) => {
    const h = home()
    const rows: Row[] = [createRow, cloneRow]
    const pasted = resolveInputPath(value, h)
    if (pasted) rows.push(pathRow(pasted, value, h))
    rows.push(...recentRows())
    return uniqueRows(rows)
  }

  const items = async (value: string) => {
    const h = home()
    const staticRows = buildStaticRows(value)
    const base = start()

    if (!shouldListFolders(value, h) || !base) {
      return staticRows
    }

    const cached = turtlecodeDirCacheHas(base)
    const pending = directories(value)

    if (!cached) {
      void pending.then(() => list?.refetch())
      return staticRows
    }

    const results = await pending
    const directoryRows = results.map((absolute) => toRow(absolute, h, "folders"))
    const rows = [...staticRows, ...directoryRows]
    return uniqueRows(rows)
  }

  function resolve(absolute: string) {
    props.onSelect(props.multiple ? [absolute] : absolute)
    dialog.close()
  }

  return (
    <Dialog title={props.title ?? language.t("command.project.open")}>
      <List
        search={{ placeholder: language.t("dialog.directory.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.directory.empty")}
        loadingMessage={language.t("common.loading")}
        items={items}
        key={(x) => x.absolute}
        filterKeys={["search"]}
        skipFilter={(query) => shouldListFolders(query, home())}
        debounceMs={150}
        groupBy={(item) => item.group}
        sortGroupsBy={(a, b) => groupRank(a.category) - groupRank(b.category)}
        groupHeader={(group) => {
          if (group.category === "create") return undefined
          if (group.category === "path") return language.t("dialog.directory.openPath.header")
          return group.category === "recent" ? language.t("home.recentProjects") : language.t("command.project.open")
        }}
        ref={(r) => (list = r)}
        onFilter={(value) => setFilter(cleanInput(value))}
        onKeyEvent={(e, item) => {
          if (e.key === "Enter" && !e.isComposing) {
            const pasted = resolveInputPath(filter(), home())
            if (pasted) {
              e.preventDefault()
              e.stopPropagation()
              resolve(pasted)
              return
            }
          }

          if (e.key !== "Tab") return
          if (e.shiftKey) return
          if (!item) return

          e.preventDefault()
          e.stopPropagation()

          const value = displayPath(item.absolute, filter(), home())
          list?.setFilter(value.endsWith("/") ? value : value + "/")
        }}
        onSelect={(row) => {
          if (!row) return
          if (row.absolute === CREATE_KEY) {
            dialog.close()
            setTimeout(() => {
              import("@/components/dialog-create-project").then((mod) => {
                dialog.show(
                  () => <mod.DialogCreateProject multiple={props.multiple} onSelect={props.onSelect} />,
                  () => props.onSelect(null),
                )
              })
            })
            return
          }
          if (row.absolute === CLONE_KEY) {
            dialog.close()
            setTimeout(() => {
              import("@/components/dialog-clone-project").then((mod) => {
                dialog.show(
                  () => <mod.DialogCloneProject onSelect={(dir) => dir && resolve(dir)} />,
                  () => props.onSelect(null),
                )
              })
            })
            return
          }
          if (row.group === "path") {
            resolve(row.absolute)
            return
          }
          resolve(row.absolute)
        }}
      >
        {(item) => {
          if (item.absolute === CREATE_KEY) {
            return (
              <div class="w-full flex items-center justify-between rounded-md">
                <div class="flex items-center gap-x-3 grow min-w-0">
                  <Icon name="plus" size="small" class="shrink-0 size-4 text-icon-interactive-base" />
                  <span class="text-14-regular text-text-interactive-base">
                    {language.t("dialog.directory.create")}
                  </span>
                </div>
              </div>
            )
          }
          if (item.absolute === CLONE_KEY) {
            return (
              <div class="w-full flex items-center justify-between rounded-md">
                <div class="flex items-center gap-x-3 grow min-w-0">
                  <Icon name="branch" size="small" class="shrink-0 size-4 text-icon-interactive-base" />
                  <span class="text-14-regular text-text-interactive-base">{language.t("dialog.clone.title")}</span>
                </div>
              </div>
            )
          }
          if (item.group === "path") {
            const path = displayPath(item.absolute, filter(), home())
            return (
              <div class="w-full flex items-center justify-between rounded-md">
                <div class="flex items-center gap-x-3 grow min-w-0">
                  <FileIcon node={{ path: item.absolute, type: "directory" }} class="shrink-0 size-4" />
                  <span class="text-14-regular text-text-interactive-base truncate">
                    {language.t("dialog.directory.openPath.action", { path })}
                  </span>
                </div>
              </div>
            )
          }
          const path = displayPath(item.absolute, filter(), home())
          if (path === "~") {
            return (
              <div class="w-full flex items-center justify-between rounded-md">
                <div class="flex items-center gap-x-3 grow min-w-0">
                  <FileIcon node={{ path: item.absolute, type: "directory" }} class="shrink-0 size-4" />
                  <div class="flex items-center text-14-regular min-w-0">
                    <span class="text-text-strong whitespace-nowrap">~</span>
                    <span class="text-text-weak whitespace-nowrap">/</span>
                  </div>
                </div>
              </div>
            )
          }
          return (
            <div class="w-full flex items-center justify-between rounded-md">
              <div class="flex items-center gap-x-3 grow min-w-0">
                <FileIcon node={{ path: item.absolute, type: "directory" }} class="shrink-0 size-4" />
                <div class="flex items-center text-14-regular min-w-0">
                  <span class="text-text-weak whitespace-nowrap overflow-hidden overflow-ellipsis truncate min-w-0">
                    {getDirectory(path)}
                  </span>
                  <span class="text-text-strong whitespace-nowrap">{getFilename(path)}</span>
                  <span class="text-text-weak whitespace-nowrap">/</span>
                </div>
              </div>
            </div>
          )
        }}
      </List>
    </Dialog>
  )
}
