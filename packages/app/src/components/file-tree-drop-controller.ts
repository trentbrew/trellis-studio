import { createSignal } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { isDescendant, uniqueName, walkEntries, type DroppedEntry } from "./file-tree-drop"

export type FileTreeDrop = ReturnType<typeof createFileTreeDrop>

const parent = (rel: string) => {
  const slash = rel.lastIndexOf("/")
  return slash === -1 ? "" : rel.slice(0, slash)
}

const basename = (rel: string) => {
  const slash = rel.lastIndexOf("/")
  return slash === -1 ? rel : rel.slice(slash + 1)
}

const topSegment = (rel: string) => {
  const slash = rel.indexOf("/")
  return slash === -1 ? rel : rel.slice(0, slash)
}

const rebaseTop = (rel: string, mapping: Map<string, string>) => {
  const top = topSegment(rel)
  const mapped = mapping.get(top)
  if (!mapped || mapped === top) return rel
  return mapped + rel.slice(top.length)
}

export function createFileTreeDrop() {
  const file = useFile()
  const sdk = useSDK()
  const [hovered, setHovered] = createSignal<string | undefined>()

  const uploadOne = async (entry: DroppedEntry, target: string, mapping: Map<string, string>, taken: Set<string>) => {
    const top = topSegment(entry.relPath)
    if (!mapping.has(top)) {
      const renamed = uniqueName(top, taken)
      mapping.set(top, renamed)
      taken.add(renamed)
    }
    const rebased = rebaseTop(entry.relPath, mapping)
    const dirRel = parent(rebased)
    const finalDir = target ? (dirRel ? `${target}/${dirRel}` : target) : dirRel
    const finalName = basename(rebased)

    const url = new URL("/file/upload", sdk.url)
    if (sdk.directory) url.searchParams.set("directory", sdk.directory)
    const fd = new FormData()
    fd.append("path", finalDir)
    fd.append("name", finalName)
    fd.append("file", entry.file, finalName)

    const res = await sdk.fetch(url, { method: "POST", body: fd })
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
    const ctype = res.headers.get("content-type") ?? ""
    if (!ctype.includes("application/json")) {
      throw new Error(`upload route missing on server (got ${ctype || "no content-type"})`)
    }
    const body = (await res.json().catch(() => null)) as { path?: string; size?: number } | null
    if (!body || typeof body.path !== "string") {
      throw new Error("upload route returned an unexpected payload")
    }
  }

  const upload = async (target: string, source: DataTransferItemList | FileList) => {
    const taken = new Set(file.tree.children(target).map((n) => n.name))
    const mapping = new Map<string, string>()
    let ok = 0
    let fail = 0

    const stream: AsyncIterable<DroppedEntry> = (() => {
      if ("length" in source && source.length > 0 && "kind" in source[0]!) {
        return walkEntries(source as unknown as ArrayLike<{ kind: string }>)
      }
      const list = source as FileList
      return (async function* () {
        for (let i = 0; i < list.length; i++) {
          const f = list.item(i)
          if (f) yield { relPath: f.name, file: f }
        }
      })()
    })()

    for await (const entry of stream) {
      try {
        await uploadOne(entry, target, mapping, taken)
        ok++
      } catch (e) {
        console.error("[file-tree-drop] upload failed", entry.relPath, e)
        fail++
      }
    }

    if (ok > 0) await file.tree.refresh(target)

    const where = target ? `/${target}` : "workspace root"
    if (fail === 0 && ok > 0) {
      showToast({
        variant: "success",
        title: `Added ${ok} file${ok === 1 ? "" : "s"} to ${where}`,
      })
    } else if (ok > 0) {
      showToast({
        variant: "default",
        title: `Added ${ok} file${ok === 1 ? "" : "s"}, ${fail} failed`,
      })
    } else if (fail > 0) {
      showToast({ variant: "error", title: "Upload failed" })
    }
  }

  const move = async (from: string, target: string) => {
    if (!from) return
    if (parent(from) === target) return
    if (isDescendant(from, target)) {
      showToast({ variant: "error", title: "Cannot move a folder into itself" })
      return
    }
    const taken = new Set(file.tree.children(target).map((n) => n.name))
    const finalName = uniqueName(basename(from), taken)
    const to = target ? `${target}/${finalName}` : finalName
    try {
      await file.rename(from, to)
      await file.tree.refresh(target)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast({ variant: "error", title: "Move failed", description: msg })
    }
  }

  const handleDragOver = (target: string, event: DragEvent) => {
    const types = event.dataTransfer?.types
    if (!types) return
    const hasFiles = types.includes("Files")
    const hasText = types.includes("text/plain")
    if (!hasFiles && !hasText) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = hasFiles ? "copy" : "move"
    if (hovered() !== target) setHovered(target)
  }

  const handleDragLeave = (event: DragEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node) {
      const root = (event.currentTarget as Element | null)?.closest("[data-filetree-root]")
      if (root && root.contains(next)) return
    }
    setHovered(undefined)
  }

  const handleDrop = async (target: string, event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setHovered(undefined)
    const dt = event.dataTransfer
    if (!dt) return
    const text = (() => {
      try {
        return dt.getData("text/plain")
      } catch {
        return ""
      }
    })()
    if (text?.startsWith("file:")) {
      const from = text.slice(5)
      await move(from, target)
      return
    }
    if (dt.items && dt.items.length > 0) {
      await upload(target, dt.items)
      return
    }
    if (dt.files && dt.files.length > 0) {
      await upload(target, dt.files)
    }
  }

  return { hovered, setHovered, handleDragOver, handleDragLeave, handleDrop }
}
