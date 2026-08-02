// Helpers for drag-and-drop on the file tree.
// Pure functions only — no DOM or SDK calls — so they can be unit tested in isolation.

export type DroppedEntry = { relPath: string; file: File }

const splitExt = (name: string) => {
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return { base: name, ext: "" }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

export function uniqueName(desired: string, existing: ReadonlySet<string>): string {
  if (!existing.has(desired)) return desired
  const { base, ext } = splitExt(desired)
  for (let i = 1; i < 10_000; i++) {
    const next = `${base} (${i})${ext}`
    if (!existing.has(next)) return next
  }
  return `${base} (${Date.now()})${ext}`
}

export function isDescendant(parent: string, child: string): boolean {
  const a = parent.replace(/^\/+|\/+$/g, "")
  const b = child.replace(/^\/+|\/+$/g, "")
  if (a === "") return b !== ""
  if (a === b) return true
  return b.startsWith(a + "/")
}

type FileSystemEntry = {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath: string
  file?: (cb: (file: File) => void, err?: (e: Error) => void) => void
  createReader?: () => {
    readEntries: (cb: (entries: FileSystemEntry[]) => void, err?: (e: Error) => void) => void
  }
}

type DataTransferItemLike = {
  kind: string
  webkitGetAsEntry?: () => FileSystemEntry | null
  getAsEntry?: () => FileSystemEntry | null
  getAsFile?: () => File | null
}

const readDir = (entry: FileSystemEntry) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => {
    const reader = entry.createReader?.()
    if (!reader) return resolve([])
    const out: FileSystemEntry[] = []
    const pump = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) return resolve(out)
          out.push(...batch)
          pump()
        },
        (err) => reject(err),
      )
    }
    pump()
  })

const readFile = (entry: FileSystemEntry) =>
  new Promise<File | undefined>((resolve) => {
    if (!entry.file) return resolve(undefined)
    entry.file(
      (file) => resolve(file),
      () => resolve(undefined),
    )
  })

async function* walk(entry: FileSystemEntry, prefix: string): AsyncGenerator<DroppedEntry> {
  if (entry.isFile) {
    const file = await readFile(entry)
    if (!file) return
    yield { relPath: prefix ? `${prefix}/${entry.name}` : entry.name, file }
    return
  }
  if (!entry.isDirectory) return
  const next = prefix ? `${prefix}/${entry.name}` : entry.name
  const children = await readDir(entry)
  for (const child of children) yield* walk(child, next)
}

export async function* walkEntries(items: ArrayLike<DataTransferItemLike>): AsyncGenerator<DroppedEntry> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item || item.kind !== "file") continue
    const entry = item.webkitGetAsEntry?.() ?? item.getAsEntry?.() ?? null
    if (entry) {
      yield* walk(entry, "")
      continue
    }
    const file = item.getAsFile?.()
    if (file) yield { relPath: file.name, file }
  }
}

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "csv",
  "tsv",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cc",
  "hh",
  "cpp",
  "hpp",
  "swift",
  "kt",
  "lua",
  "sh",
  "bash",
  "zsh",
  "fish",
  "vue",
  "svelte",
  "sol",
  "graphql",
  "gql",
  "log",
  "env",
  "gitignore",
  "dockerfile",
])

export function isProbablyText(file: File): boolean {
  if (file.type.startsWith("text/")) return true
  if (file.type === "application/json" || file.type === "application/xml") return true
  const dot = file.name.lastIndexOf(".")
  if (dot < 0) return false
  return TEXT_EXTS.has(file.name.slice(dot + 1).toLowerCase())
}
