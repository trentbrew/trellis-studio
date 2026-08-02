import { useFile } from "@/context/file"
import { encodeFilePath } from "@/context/file/path"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import {
  createEffect,
  createMemo,
  For,
  Match,
  onCleanup,
  on,
  Show,
  splitProps,
  Switch,
  untrack,
  type ComponentProps,
  type JSXElement,
  type ParentProps,
  type ValidComponent,
} from "solid-js"
import { Dynamic } from "solid-js/web"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { createFileTreeDrop, type FileTreeDrop } from "./file-tree-drop-controller"

const MAX_DEPTH = 128

function pathToFileUrl(filepath: string): string {
  return `file://${encodeFilePath(filepath)}`
}

type Kind = "add" | "del" | "mix"

type Filter = {
  files: Set<string>
  dirs: Set<string>
}

export function shouldListRoot(input: { level: number; dir?: { loaded?: boolean; loading?: boolean } }) {
  if (input.level !== 0) return false
  if (input.dir?.loaded) return false
  if (input.dir?.loading) return false
  return true
}

export function shouldListExpanded(input: {
  level: number
  dir?: { expanded?: boolean; loaded?: boolean; loading?: boolean }
}) {
  if (input.level === 0) return false
  if (!input.dir?.expanded) return false
  if (input.dir.loaded) return false
  if (input.dir.loading) return false
  return true
}

export function dirsToExpand(input: {
  level: number
  filter?: { dirs: Set<string> }
  expanded: (dir: string) => boolean
}) {
  if (input.level !== 0) return []
  if (!input.filter) return []
  return [...input.filter.dirs].filter((dir) => !input.expanded(dir))
}

const kindLabel = (kind: Kind) => {
  if (kind === "add") return "A"
  if (kind === "del") return "D"
  return "M"
}

const kindTextColor = (kind: Kind) => {
  if (kind === "add") return "color: var(--icon-diff-add-base)"
  if (kind === "del") return "color: var(--icon-diff-delete-base)"
  return "color: var(--icon-diff-modified-base)"
}

const kindDotColor = (kind: Kind) => {
  if (kind === "add") return "background-color: var(--icon-diff-add-base)"
  if (kind === "del") return "background-color: var(--icon-diff-delete-base)"
  return "background-color: var(--icon-diff-modified-base)"
}

const visibleKind = (node: FileNode, kinds?: ReadonlyMap<string, Kind>, marks?: Set<string>) => {
  const kind = kinds?.get(node.path)
  if (!kind) return
  if (!marks?.has(node.path)) return
  return kind
}

const buildDragImage = (target: HTMLElement) => {
  const icon = target.querySelector('[data-component="file-icon"]') ?? target.querySelector("svg")
  const text = target.querySelector("span")
  if (!icon || !text) return

  const image = document.createElement("div")
  image.className =
    "flex items-center gap-x-2 px-2 py-1 bg-surface-raised-base rounded-md border border-border-base text-12-regular text-text-strong"
  image.style.position = "absolute"
  image.style.top = "-1000px"
  image.innerHTML = (icon as SVGElement).outerHTML + (text as HTMLSpanElement).outerHTML
  return image
}

const withFileDragImage = (event: DragEvent) => {
  const image = buildDragImage(event.currentTarget as HTMLElement)
  if (!image) return
  document.body.appendChild(image)
  event.dataTransfer?.setDragImage(image, 0, 12)
  setTimeout(() => document.body.removeChild(image), 0)
}

const FileTreeNode = (
  p: ParentProps &
    ComponentProps<"div"> &
    ComponentProps<"button"> & {
      node: FileNode
      level: number
      active?: string
      nodeClass?: string
      draggable: boolean
      kinds?: ReadonlyMap<string, Kind>
      marks?: Set<string>
      as?: "div" | "button"
      wrapper?: ValidComponent
      isEmpty?: boolean
      dropHovered?: boolean
    },
) => {
  const [local, rest] = splitProps(p, [
    "node",
    "level",
    "active",
    "nodeClass",
    "draggable",
    "kinds",
    "marks",
    "as",
    "wrapper",
    "children",
    "class",
    "classList",
    "dropHovered",
  ])
  const kind = () => visibleKind(local.node, local.kinds, local.marks)
  const active = () => !!kind() && !local.node.ignored
  const color = () => {
    const value = kind()
    if (!value) return
    return kindTextColor(value)
  }

  const component = () => local.wrapper ?? local.as ?? "div"
  const polymorphic = local.wrapper ? { as: local.as ?? "div" } : {}

  return (
    <Dynamic
      component={component()}
      {...polymorphic}
      data-file-path={local.node.type === "file" ? local.node.path : undefined}
      classList={{
        "w-full min-w-0 h-6 flex items-center justify-start gap-x-1.5 rounded-md px-1.5 py-0 text-left hover:bg-surface-raised-base-hover active:bg-surface-base-active transition-colors cursor-pointer": true,
        "bg-surface-base-active": local.node.path === local.active,
        "opacity-60": local.node.name.startsWith("."),
        "ring-1 ring-border-strong-base/70 bg-surface-base-active/60": !!local.dropHovered,
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
        [local.nodeClass ?? ""]: !!local.nodeClass,
      }}
      style={`padding-left: ${Math.max(0, 8 + local.level * 22 - (local.node.type === "file" ? 20 : 4))}px`}
      draggable={local.draggable}
      onDragStart={(event: DragEvent) => {
        if (!local.draggable) return
        event.stopPropagation()
        event.dataTransfer?.setData("text/plain", `file:${local.node.path}`)
        event.dataTransfer?.setData("text/uri-list", pathToFileUrl(local.node.path))
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove"
        withFileDragImage(event)
      }}
      {...rest}
    >
      {local.children}
      <span
        classList={{
          "flex-1 min-w-0 text-12-medium whitespace-nowrap truncate": true,
          "text-text-weaker": local.node.ignored || p.isEmpty,
          "text-text-weak": !local.node.ignored && !active() && !p.isEmpty,
        }}
        style={active() ? color() : undefined}
      >
        {local.node.name}
      </span>
      {(() => {
        const value = kind()
        if (!value) return null
        if (local.node.type === "file") {
          return (
            <span class="shrink-0 w-4 text-center text-12-medium" style={kindTextColor(value)}>
              {kindLabel(value)}
            </span>
          )
        }
        return <div class="shrink-0 size-1.5 mr-1.5 rounded-full" style={kindDotColor(value)} />
      })()}
    </Dynamic>
  )
}

export default function FileTree(props: {
  path: string
  class?: string
  nodeClass?: string
  active?: string
  level?: number
  allowed?: readonly string[]
  modified?: readonly string[]
  kinds?: ReadonlyMap<string, Kind>
  draggable?: boolean
  onFileClick?: (file: FileNode) => void
  onNodeContextMenu?: (node: FileNode, event: MouseEvent) => void

  _filter?: Filter
  _marks?: Set<string>
  _deeps?: Map<string, number>
  _kinds?: ReadonlyMap<string, Kind>
  _chain?: readonly string[]
  _drop?: FileTreeDrop
}) {
  const file = useFile()
  const level = props.level ?? 0
  const draggable = () => props.draggable ?? true
  let root: HTMLDivElement | undefined
  let frame: number | undefined

  const drop: FileTreeDrop | undefined = level === 0 ? (props._drop ?? createFileTreeDrop()) : props._drop

  const parentPath = (p: string) => {
    const slash = p.lastIndexOf("/")
    return slash === -1 ? "" : p.slice(0, slash)
  }

  const key = (p: string) =>
    file
      .normalize(p)
      .replace(/[\\/]+$/, "")
      .replaceAll("\\", "/")
  const chain = props._chain ? [...props._chain, key(props.path)] : [key(props.path)]

  const filter = createMemo(() => {
    if (props._filter) return props._filter

    const allowed = props.allowed
    if (!allowed) return

    const files = new Set(allowed)
    const dirs = new Set<string>()

    for (const item of allowed) {
      const parts = item.split("/")
      const parents = parts.slice(0, -1)
      for (const [idx] of parents.entries()) {
        const dir = parents.slice(0, idx + 1).join("/")
        if (dir) dirs.add(dir)
      }
    }

    return { files, dirs }
  })

  const marks = createMemo(() => {
    if (props._marks) return props._marks

    const out = new Set<string>()
    for (const item of props.modified ?? []) out.add(item)
    for (const item of props.kinds?.keys() ?? []) out.add(item)
    if (out.size === 0) return
    return out
  })

  const kinds = createMemo(() => {
    if (props._kinds) return props._kinds
    return props.kinds
  })

  const deeps = createMemo(() => {
    if (props._deeps) return props._deeps

    const out = new Map<string, number>()

    const root = props.path
    if (!(file.tree.state(root)?.expanded ?? false)) return out

    const seen = new Set<string>()
    const stack: { dir: string; lvl: number; i: number; kids: string[]; max: number }[] = []

    const push = (dir: string, lvl: number) => {
      const id = key(dir)
      if (seen.has(id)) return
      seen.add(id)

      const kids = file.tree
        .children(dir)
        .filter((node) => node.type === "directory" && (file.tree.state(node.path)?.expanded ?? false))
        .map((node) => node.path)

      stack.push({ dir, lvl, i: 0, kids, max: lvl })
    }

    push(root, level - 1)

    while (stack.length > 0) {
      const top = stack[stack.length - 1]!

      if (top.i < top.kids.length) {
        const next = top.kids[top.i]!
        top.i++
        push(next, top.lvl + 1)
        continue
      }

      out.set(top.dir, top.max)
      stack.pop()

      const parent = stack[stack.length - 1]
      if (!parent) continue
      parent.max = Math.max(parent.max, top.max)
    }

    return out
  })

  createEffect(() => {
    const current = filter()
    const dirs = dirsToExpand({
      level,
      filter: current,
      expanded: (dir) => untrack(() => file.tree.state(dir)?.expanded) ?? false,
    })
    for (const dir of dirs) file.tree.expand(dir)
  })

  createEffect(
    on(
      () => props.path,
      (path) => {
        const dir = untrack(() => file.tree.state(path))
        if (!shouldListRoot({ level, dir })) return
        void file.tree.list(path)
      },
      { defer: false },
    ),
  )

  createEffect(
    on(
      () => {
        const active = props.active
        if (level !== 0 || !active) return ""
        const parts = active.split("/").slice(0, -1)
        const parent = parts.at(-1) ?? ""
        const state = parts.map((dir, i) => {
          const path = parts.slice(0, i + 1).join("/")
          const node = file.tree.state(path)
          return `${path}:${node?.expanded ? 1 : 0}:${node?.loaded ? 1 : 0}:${node?.loading ? 1 : 0}`
        })
        return [active, parent, file.tree.children(parent).length, ...state].join("|")
      },
      () => {
        const active = props.active
        if (level !== 0 || !active) return

        const parts = active.split("/").slice(0, -1)
        for (const [i] of parts.entries()) {
          const dir = parts.slice(0, i + 1).join("/")
          if (!dir) continue
          file.tree.expand(dir)
        }

        if (typeof window === "undefined") return
        if (frame !== undefined) cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          frame = undefined
          const nodes = root?.querySelectorAll("[data-file-path]")
          const target = Array.from(nodes ?? []).find((item) => item.getAttribute("data-file-path") === active)
          if (!(target instanceof HTMLElement)) return
          target.scrollIntoView({ block: "nearest", behavior: "smooth" })
        })
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
  })

  const nodes = createMemo(() => {
    const nodes = file.tree.children(props.path)
    const current = filter()
    if (!current) return nodes

    const parent = (path: string) => {
      const idx = path.lastIndexOf("/")
      if (idx === -1) return ""
      return path.slice(0, idx)
    }

    const leaf = (path: string) => {
      const idx = path.lastIndexOf("/")
      return idx === -1 ? path : path.slice(idx + 1)
    }

    const out = nodes.filter((node) => {
      if (node.type === "file") return current.files.has(node.path)
      return current.dirs.has(node.path)
    })

    const seen = new Set(out.map((node) => node.path))

    for (const dir of current.dirs) {
      if (parent(dir) !== props.path) continue
      if (seen.has(dir)) continue
      out.push({
        name: leaf(dir),
        path: dir,
        absolute: dir,
        type: "directory",
        ignored: false,
      })
      seen.add(dir)
    }

    for (const item of current.files) {
      if (parent(item) !== props.path) continue
      if (seen.has(item)) continue
      out.push({
        name: leaf(item),
        path: item,
        absolute: item,
        type: "file",
        ignored: false,
      })
      seen.add(item)
    }

    out.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    return out
  })

  const isRootLevel = level === 0
  const rootHover = () => isRootLevel && drop?.hovered() === ""

  return (
    <div
      data-component="filetree"
      data-filetree-root={isRootLevel ? "true" : undefined}
      ref={root}
      class={`flex flex-col gap-0.5 ${isRootLevel ? "min-h-full" : ""} ${props.class ?? ""}`}
      classList={{
        "ring-1 ring-inset ring-border-strong-base/60 rounded-md": rootHover(),
      }}
      onDragOver={isRootLevel && drop ? (event: DragEvent) => drop.handleDragOver("", event) : undefined}
      onDragLeave={isRootLevel && drop ? drop.handleDragLeave : undefined}
      onDrop={isRootLevel && drop ? (event: DragEvent) => drop.handleDrop("", event) : undefined}
    >
      <For each={nodes()}>
        {(node) => {
          const expanded = () => file.tree.state(node.path)?.expanded ?? false
          const deep = () => deeps().get(node.path) ?? -1
          const kind = () => visibleKind(node, kinds(), marks())
          const active = () => !!kind() && !node.ignored
          const dropTarget = node.type === "directory" ? node.path : parentPath(node.path)
          const isHover = () => drop?.hovered() === dropTarget
          const onDragOver = drop ? (event: DragEvent) => drop.handleDragOver(dropTarget, event) : undefined
          const onDrop = drop ? (event: DragEvent) => drop.handleDrop(dropTarget, event) : undefined

          return (
            <Switch>
              <Match when={node.type === "directory"}>
                <Collapsible
                  variant="ghost"
                  class="w-full"
                  data-scope="filetree"
                  forceMount={false}
                  open={expanded()}
                  onOpenChange={(open) => {
                    if (!open) {
                      const active = props.active
                      if (active && active.startsWith(node.path + "/")) return
                    }
                    open ? file.tree.expand(node.path) : file.tree.collapse(node.path)
                  }}
                >
                  <FileTreeNode
                    wrapper={Collapsible.Trigger}
                    as="div"
                    node={node}
                    level={level}
                    active={props.active}
                    nodeClass={props.nodeClass}
                    draggable={draggable()}
                    kinds={kinds()}
                    marks={marks()}
                    isEmpty={file.tree.children(node.path).length === 0}
                    dropHovered={isHover()}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onContextMenu={(event: MouseEvent) => {
                      if (!props.onNodeContextMenu) return
                      event.preventDefault()
                      event.stopPropagation()
                      props.onNodeContextMenu(node, event)
                    }}
                  >
                    <div class="size-4 flex items-center justify-center text-icon-weak">
                      <Icon name={expanded() ? "chevron-down" : "chevron-right"} size="small" />
                    </div>
                    <Icon name={expanded() ? "folder-open" : "folder"} size="small" class="text-icon-weak" />
                  </FileTreeNode>
                  <Collapsible.Content
                    class="relative pt-0.5"
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                  >
                    <div
                      classList={{
                        "absolute top-0 bottom-0 w-px pointer-events-none bg-border-weak-base opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none": true,
                        "group-hover/filetree:opacity-100": expanded() && deep() === level,
                        "group-hover/filetree:opacity-50": !(expanded() && deep() === level),
                      }}
                      style={`left: ${Math.max(0, 8 + level * 22 - 4) + 8}px`}
                    />
                    <Show
                      when={level < MAX_DEPTH && !chain.includes(key(node.path))}
                      fallback={<div class="px-2 py-1 text-12-regular text-text-weak">...</div>}
                    >
                      <FileTree
                        path={node.path}
                        level={level + 1}
                        allowed={props.allowed}
                        modified={props.modified}
                        kinds={props.kinds}
                        active={props.active}
                        draggable={props.draggable}
                        onFileClick={props.onFileClick}
                        onNodeContextMenu={props.onNodeContextMenu}
                        _filter={filter()}
                        _marks={marks()}
                        _deeps={deeps()}
                        _kinds={kinds()}
                        _chain={chain}
                        _drop={drop}
                      />
                    </Show>
                  </Collapsible.Content>
                </Collapsible>
              </Match>
              <Match when={node.type === "file"}>
                <FileTreeNode
                  node={node}
                  level={level}
                  active={props.active}
                  nodeClass={props.nodeClass}
                  draggable={draggable()}
                  kinds={kinds()}
                  marks={marks()}
                  as="div"
                  role="button"
                  tabIndex={0}
                  dropHovered={isHover()}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onClick={() => props.onFileClick?.(node)}
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    props.onFileClick?.(node)
                  }}
                  onContextMenu={(event: MouseEvent) => {
                    if (!props.onNodeContextMenu) return
                    event.preventDefault()
                    event.stopPropagation()
                    props.onNodeContextMenu(node, event)
                  }}
                >
                  <div class="w-5 shrink-0" />
                  <Switch>
                    <Match when={node.ignored}>
                      <FileIcon
                        node={node}
                        class="size-4 filetree-icon filetree-icon--mono"
                        style="color: var(--icon-weak-base)"
                        mono
                      />
                    </Match>
                    <Match when={active()}>
                      <FileIcon
                        node={node}
                        class="size-4 filetree-icon filetree-icon--mono"
                        style={kindTextColor(kind()!)}
                        mono
                      />
                    </Match>
                    <Match when={!node.ignored}>
                      <span class="filetree-iconpair size-4">
                        <FileIcon
                          node={node}
                          class="size-4 filetree-icon filetree-icon--color opacity-0 group-hover/filetree:opacity-100"
                        />
                        <FileIcon
                          node={node}
                          class="size-4 filetree-icon filetree-icon--mono group-hover/filetree:opacity-0"
                          mono
                        />
                      </span>
                    </Match>
                  </Switch>
                </FileTreeNode>
              </Match>
            </Switch>
          )
        }}
      </For>
    </div>
  )
}
