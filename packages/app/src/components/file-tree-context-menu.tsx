import { createSignal, Show, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { DialogNewFileEntry } from "@/components/dialog-new-file-entry"
import { DialogRenameFile } from "@/components/dialog-rename-file"
import { useFile } from "@/context/file"

type Pos = { x: number; y: number }
type EntryKind = "file" | "dir"
type Target = { kind: EntryKind | "root"; path: string; baseDir: string }

function parent(path: string) {
  const idx = path.lastIndexOf("/")
  return idx === -1 ? "" : path.slice(0, idx)
}

export function useFileTreeContextMenu(props?: {
  onFileCreated?: (path: string) => void
  onFileDeleted?: (path: string, kind: EntryKind) => void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const file = useFile()
  const [open, setOpen] = createSignal(false)
  const [pos, setPos] = createSignal<Pos>({ x: 0, y: 0 })
  const [target, setTarget] = createSignal<Target>({ kind: "root", path: "", baseDir: "" })

  function close() {
    setOpen(false)
  }

  function showAt(event: MouseEvent, t: Target) {
    setTarget(t)
    setPos({ x: event.clientX, y: event.clientY })
    setOpen(true)
  }

  function showNode(node: FileNode, event: MouseEvent) {
    showAt(event, {
      kind: node.type === "directory" ? "dir" : "file",
      path: node.path,
      baseDir: node.type === "directory" ? node.path : parent(node.path),
    })
  }

  function showRoot(event: MouseEvent) {
    showAt(event, { kind: "root", path: "", baseDir: "" })
  }

  function newFile(baseDir: string) {
    close()
    dialog.show(() => (
      <DialogNewFileEntry
        kind="file"
        baseDir={baseDir}
        onCreated={(path, kind) => {
          if (kind === "file") props?.onFileCreated?.(path)
        }}
      />
    ))
  }

  function newFolder(baseDir: string) {
    close()
    dialog.show(() => <DialogNewFileEntry kind="folder" baseDir={baseDir} />)
  }

  function rename(path: string, kind: "file" | "dir") {
    close()
    dialog.show(() => <DialogRenameFile path={path} kind={kind} />)
  }

  async function copyPath(path: string) {
    close()
    try {
      await navigator.clipboard.writeText(path)
      showToast({ variant: "success", title: language.t("session.fileTree.contextMenu.copyPath.done") })
    } catch (e) {
      showToast({ variant: "error", title: language.t("session.fileTree.contextMenu.copyPath.failed") })
    }
  }

  async function deleteFile(path: string, kind: EntryKind = "file") {
    close()
    const confirmed = confirm(`Are you sure you want to delete "${path}"? This action cannot be undone.`)
    if (!confirmed) return

    try {
      await file.remove(path)
      props?.onFileDeleted?.(path, kind)
      showToast({ variant: "success", title: "Deleted successfully" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e)
      showToast({ variant: "error", title: "Failed to delete", description: msg })
    }
  }

  return {
    open,
    pos,
    target,
    close,
    showNode,
    showRoot,
    newFile,
    newFolder,
    rename,
    copyPath,
    deleteFile,
  }
}

export function FileTreeContextMenu(props: { ctrl: ReturnType<typeof useFileTreeContextMenu> }) {
  const language = useLanguage()

  const onDocDown = (e: MouseEvent) => {
    const el = document.getElementById("file-tree-ctx-menu")
    if (el && e.target instanceof Node && el.contains(e.target)) return
    props.ctrl.close()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.ctrl.close()
  }

  if (typeof window !== "undefined") {
    window.addEventListener("mousedown", onDocDown, true)
    window.addEventListener("keydown", onKey)
    onCleanup(() => {
      window.removeEventListener("mousedown", onDocDown, true)
      window.removeEventListener("keydown", onKey)
    })
  }

  return (
    <Show when={props.ctrl.open()}>
      <Portal>
        <div
          id="file-tree-ctx-menu"
          role="menu"
          class="fixed z-[9999] min-w-[180px] rounded-md border border-border-base bg-surface-raised-base shadow-lg py-1 text-text-strong"
          style={{ left: `${props.ctrl.pos().x}px`, top: `${props.ctrl.pos().y}px` }}
        >
          <button
            type="button"
            class="w-full px-3 py-1.5 text-left text-12-medium hover:bg-surface-raised-base-hover"
            onClick={() => props.ctrl.newFile(props.ctrl.target().baseDir)}
          >
            {language.t("session.fileTree.newFile")}
          </button>
          <button
            type="button"
            class="w-full px-3 py-1.5 text-left text-12-medium hover:bg-surface-raised-base-hover"
            onClick={() => props.ctrl.newFolder(props.ctrl.target().baseDir)}
          >
            {language.t("session.fileTree.newFolder")}
          </button>
          <Show when={props.ctrl.target().kind !== "root"}>
            <div class="my-1 h-px bg-border-weaker-base" />
            <button
              type="button"
              class="w-full px-3 py-1.5 text-left text-12-medium hover:bg-surface-raised-base-hover"
              onClick={() => {
                const t = props.ctrl.target()
                if (t.kind === "root") return
                props.ctrl.rename(t.path, t.kind === "dir" ? "dir" : "file")
              }}
            >
              {language.t("session.fileTree.contextMenu.rename")}
            </button>
            <button
              type="button"
              class="w-full px-3 py-1.5 text-left text-12-medium hover:bg-surface-raised-base-hover"
              onClick={() => props.ctrl.copyPath(props.ctrl.target().path)}
            >
              {language.t("session.fileTree.contextMenu.copyPath")}
            </button>
            <button
              type="button"
              class="w-full px-3 py-1.5 text-left text-12-medium hover:bg-surface-raised-base-hover text-text-destructive"
              onClick={() => {
                const t = props.ctrl.target()
                if (t.kind === "root") return
                props.ctrl.deleteFile(t.path, t.kind)
              }}
            >
              Delete
            </button>
          </Show>
        </div>
      </Portal>
    </Show>
  )
}
