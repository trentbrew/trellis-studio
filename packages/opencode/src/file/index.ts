import { BusEvent } from "@/bus/bus-event"
import { InstanceState } from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { AppFileSystem } from "@/filesystem"
import { git } from "@/util/git"
import { Effect, Layer, ServiceMap } from "effect"
import { formatPatch, structuredPatch } from "diff"
import fs from "fs"
import fuzzysort from "fuzzysort"
import ignore from "ignore"
import path from "path"
import z from "zod"
import { Bus } from "../bus"
import { FileWatcher } from "./watcher"
import { Format } from "../format"
import { LSP } from "../lsp"
import { Global } from "../global"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"
import { Protected } from "./protected"
import { Ripgrep } from "./ripgrep"
import * as SemanticLinks from "../trellis/semantic-links"
import { Trellis } from "../trellis"

export namespace File {
  export const Info = z
    .object({
      path: z.string(),
      added: z.number().int(),
      removed: z.number().int(),
      status: z.enum(["added", "deleted", "modified"]),
    })
    .meta({
      ref: "File",
    })

  export type Info = z.infer<typeof Info>

  export const Node = z
    .object({
      name: z.string(),
      path: z.string(),
      absolute: z.string(),
      type: z.enum(["file", "directory"]),
      ignored: z.boolean(),
    })
    .meta({
      ref: "FileNode",
    })
  export type Node = z.infer<typeof Node>

  export const Content = z
    .object({
      type: z.enum(["text", "binary"]),
      content: z.string(),
      diff: z.string().optional(),
      patch: z
        .object({
          oldFileName: z.string(),
          newFileName: z.string(),
          oldHeader: z.string().optional(),
          newHeader: z.string().optional(),
          hunks: z.array(
            z.object({
              oldStart: z.number(),
              oldLines: z.number(),
              newStart: z.number(),
              newLines: z.number(),
              lines: z.array(z.string()),
            }),
          ),
          index: z.string().optional(),
        })
        .optional(),
      encoding: z.literal("base64").optional(),
      mimeType: z.string().optional(),
    })
    .meta({
      ref: "FileContent",
    })
  export type Content = z.infer<typeof Content>

  export const WriteInput = z
    .object({
      path: z.string(),
      content: z.string(),
      encoding: z.literal("base64").optional(),
      mimeType: z.string().optional(),
      format: z.boolean().optional(),
    })
    .meta({
      ref: "FileWriteInput",
    })
  export type WriteInput = z.infer<typeof WriteInput>

  export const Event = {
    Edited: BusEvent.define(
      "file.edited",
      z.object({
        file: z.string(),
      }),
    ),
  }

  const log = Log.create({ service: "file" })

  const binary = new Set([
    "exe",
    "dll",
    "pdb",
    "bin",
    "so",
    "dylib",
    "o",
    "a",
    "lib",
    "wav",
    "mp3",
    "ogg",
    "oga",
    "ogv",
    "ogx",
    "flac",
    "aac",
    "wma",
    "m4a",
    "weba",
    "opus",
    "aif",
    "aiff",
    "mid",
    "midi",
    "mp4",
    "m4v",
    "avi",
    "mov",
    "wmv",
    "flv",
    "webm",
    "mkv",
    "3gp",
    "3g2",
    "zip",
    "tar",
    "gz",
    "gzip",
    "bz",
    "bz2",
    "bzip",
    "bzip2",
    "7z",
    "rar",
    "xz",
    "lz",
    "z",
    "dmg",
    "iso",
    "img",
    "vmdk",
    "eot",
    "sqlite",
    "db",
    "mdb",
    "apk",
    "ipa",
    "aab",
    "xapk",
    "app",
    "pkg",
    "deb",
    "rpm",
    "snap",
    "flatpak",
    "appimage",
    "msi",
    "msp",
    "jar",
    "war",
    "ear",
    "class",
    "kotlin_module",
    "dex",
    "vdex",
    "odex",
    "oat",
    "art",
    "wasm",
    "wat",
    "bc",
    "ll",
    "s",
    "ko",
    "sys",
    "drv",
    "efi",
    "rom",
    "com",
    "xls",
    "xlsx",
  ])

  const encoded = new Set([
    "pdf",
    "ttf",
    "otf",
    "woff",
    "woff2",
    "mp3",
    "wav",
    "ogg",
    "oga",
    "flac",
    "aac",
    "wma",
    "m4a",
    "weba",
    "opus",
    "aif",
    "aiff",
    "mid",
    "midi",
  ])

  const image = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "bmp",
    "webp",
    "ico",
    "tif",
    "tiff",
    "svg",
    "svgz",
    "avif",
    "apng",
    "jxl",
    "heic",
    "heif",
    "raw",
    "cr2",
    "nef",
    "arw",
    "dng",
    "orf",
    "raf",
    "pef",
    "x3f",
  ])

  const text = new Set([
    "ts",
    "tsx",
    "mts",
    "cts",
    "mtsx",
    "ctsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "sh",
    "bash",
    "zsh",
    "fish",
    "ps1",
    "psm1",
    "cmd",
    "bat",
    "json",
    "jsonc",
    "json5",
    "yaml",
    "yml",
    "toml",
    "md",
    "mdx",
    "txt",
    "xml",
    "html",
    "htm",
    "css",
    "scss",
    "sass",
    "less",
    "graphql",
    "gql",
    "sql",
    "ini",
    "cfg",
    "conf",
    "env",
  ])

  const textName = new Set([
    "dockerfile",
    "justfile",
    "makefile",
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
    ".npmrc",
    ".nvmrc",
    ".prettierrc",
    ".eslintrc",
  ])

  const mime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    ico: "image/x-icon",
    tif: "image/tiff",
    tiff: "image/tiff",
    svg: "image/svg+xml",
    svgz: "image/svg+xml",
    avif: "image/avif",
    apng: "image/apng",
    jxl: "image/jxl",
    heic: "image/heic",
    heif: "image/heif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
    m4a: "audio/mp4",
    weba: "audio/webm",
    opus: "audio/opus",
    aif: "audio/aiff",
    aiff: "audio/aiff",
    mid: "audio/midi",
    midi: "audio/midi",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    ogv: "video/ogg",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    flv: "video/x-flv",
    wmv: "video/x-ms-wmv",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
    pdf: "application/pdf",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }

  const sheet = new Set(["xls", "xlsx"])

  type Entry = { files: string[]; dirs: string[] }

  const ext = (file: string) => path.extname(file).toLowerCase().slice(1)
  const name = (file: string) => path.basename(file).toLowerCase()
  const isImageByExtension = (file: string) => image.has(ext(file))
  const isTextByExtension = (file: string) => text.has(ext(file))
  const isTextByName = (file: string) => textName.has(name(file))
  const isEncodedByExtension = (file: string) => encoded.has(ext(file))
  const isBinaryByExtension = (file: string) => binary.has(ext(file))
  const isSheetByExtension = (file: string) => sheet.has(ext(file))
  const isImage = (type: string) => type.startsWith("image/")
  const inline = (type: string) => {
    if (isImage(type)) return true
    if (type.startsWith("audio/")) return true
    if (type.startsWith("font/")) return true
    return type === "application/pdf"
  }
  const getMimeType = (file: string) => mime[ext(file)]
  const getImageMimeType = (file: string) => getMimeType(file) || "image/" + ext(file)

  function shouldEncode(mimeType: string) {
    const type = mimeType.toLowerCase()
    log.debug("shouldEncode", { type })
    if (!type) return false
    if (type.startsWith("text/")) return false
    if (type.includes("charset=")) return false
    const top = type.split("/", 2)[0]
    return ["image", "audio", "video", "font", "model", "multipart"].includes(top)
  }

  const hidden = (item: string) => {
    const normalized = item.replaceAll("\\", "/").replace(/\/+$/, "")
    return normalized.split("/").some((part) => part.startsWith(".") && part.length > 1)
  }

  const sortHiddenLast = (items: string[], prefer: boolean) => {
    if (prefer) return items
    const visible: string[] = []
    const hiddenItems: string[] = []
    for (const item of items) {
      if (hidden(item)) hiddenItems.push(item)
      else visible.push(item)
    }
    return [...visible, ...hiddenItems]
  }

  /** VS Code-style matching: space-separated patterns match path segments in order. */
  const searchByPathSegments = (items: string[], query: string, limit: number) => {
    const patterns = query.trim().split(/\s+/).filter(Boolean)
    if (patterns.length <= 1) return null

    const scored: { target: string; score: number }[] = []
    for (const item of items) {
      const segments = item.split("/").filter(Boolean)
      let segIdx = 0
      let score = 0
      let matched = true

      for (const pattern of patterns) {
        let found = false
        while (segIdx < segments.length) {
          const result = fuzzysort.single(pattern, segments[segIdx]!)
          if (result) {
            score += result.score
            segIdx++
            found = true
            break
          }
          segIdx++
        }
        if (!found) {
          matched = false
          break
        }
      }

      if (matched) scored.push({ target: item, score })
    }

    if (scored.length === 0) return null
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.target)
  }

  interface State {
    cache: Entry
  }

  export interface Interface {
    readonly init: () => Effect.Effect<void>
    readonly status: () => Effect.Effect<File.Info[]>
    readonly read: (file: string) => Effect.Effect<File.Content>
    readonly write: (input: File.WriteInput) => Effect.Effect<File.Content>
    readonly list: (dir?: string) => Effect.Effect<File.Node[]>
    readonly search: (input: {
      query: string
      limit?: number
      dirs?: boolean
      type?: "file" | "directory"
    }) => Effect.Effect<string[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/File") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const appFs = yield* AppFileSystem.Service

      const state = yield* InstanceState.make<State>(
        Effect.fn("File.state")(() =>
          Effect.succeed({
            cache: { files: [], dirs: [] } as Entry,
          }),
        ),
      )

      const scanDeskRoot = async (directory: string): Promise<Entry> => {
        const next: Entry = { files: [], dirs: [] }
        const seenDirs = new Set<string>()
        const exclude = new Set([".git", ".DS_Store"])

        const walk = async (rel: string, depth: number) => {
          if (depth > 12) return
          const abs = rel ? path.join(directory, rel) : directory
          const entries = await fs.promises.readdir(abs, { withFileTypes: true }).catch(() => [] as fs.Dirent[])
          for (const entry of entries) {
            if (exclude.has(entry.name)) continue
            const child = rel ? `${rel}/${entry.name}` : entry.name
            if (entry.isSymbolicLink()) {
              next.files.push(child)
              continue
            }
            if (entry.isDirectory()) {
              const dir = child + "/"
              if (!seenDirs.has(dir)) {
                seenDirs.add(dir)
                next.dirs.push(dir)
              }
              await walk(child, depth + 1)
              continue
            }
            if (entry.isFile()) next.files.push(child)
          }
        }

        await walk("", 0)
        next.dirs = next.dirs.toSorted()
        return next
      }

      const scan = Effect.fn("File.scan")(function* () {
        if (Instance.directory === path.parse(Instance.directory).root) return
        const isGlobalHome = Instance.directory === Global.Path.home && Instance.project.id === "global"
        const isDeskRoot = Instance.worktree === "/"
        const next: Entry = { files: [], dirs: [] }

        yield* Effect.promise(async () => {
          if (isGlobalHome) {
            const dirs = new Set<string>()
            const protectedNames = Protected.names()
            const ignoreNested = new Set(["node_modules", "dist", "build", "target", "vendor"])
            const shouldIgnoreName = (name: string) => name.startsWith(".") || protectedNames.has(name)
            const shouldIgnoreNested = (name: string) => name.startsWith(".") || ignoreNested.has(name)
            const top = await fs.promises
              .readdir(Instance.directory, { withFileTypes: true })
              .catch(() => [] as fs.Dirent[])

            for (const entry of top) {
              if (!entry.isDirectory()) continue
              if (shouldIgnoreName(entry.name)) continue
              dirs.add(entry.name + "/")

              const base = path.join(Instance.directory, entry.name)
              const children = await fs.promises.readdir(base, { withFileTypes: true }).catch(() => [] as fs.Dirent[])
              for (const child of children) {
                if (!child.isDirectory()) continue
                if (shouldIgnoreNested(child.name)) continue
                dirs.add(entry.name + "/" + child.name + "/")
              }
            }

            next.dirs = Array.from(dirs).toSorted()
          } else if (isDeskRoot) {
            const scanned = await scanDeskRoot(Instance.directory)
            next.files = scanned.files
            next.dirs = scanned.dirs
          } else {
            const seen = new Set<string>()
            for await (const file of Ripgrep.files({ cwd: Instance.directory, follow: true })) {
              next.files.push(file)
              let current = file
              while (true) {
                const dir = path.dirname(current)
                if (dir === ".") break
                if (dir === current) break
                current = dir
                if (seen.has(dir)) continue
                seen.add(dir)
                next.dirs.push(dir + "/")
              }
            }
          }
        })

        const s = yield* InstanceState.get(state)
        s.cache = next
      })

      let cachedScan = yield* Effect.cached(scan().pipe(Effect.catchCause(() => Effect.void)))

      const ensure = Effect.fn("File.ensure")(function* () {
        yield* cachedScan
        cachedScan = yield* Effect.cached(scan().pipe(Effect.catchCause(() => Effect.void)))
      })

      const init = Effect.fn("File.init")(function* () {
        yield* ensure()
      })

      const emit = Effect.fn("File.emit")(function* (file: string, exists: boolean, touch: boolean) {
        yield* Effect.promise(() => Bus.publish(File.Event.Edited, { file }))
        yield* Effect.promise(() =>
          Bus.publish(FileWatcher.Event.Updated, {
            file,
            event: exists ? "change" : "add",
          }),
        )
        if (touch) yield* Effect.promise(() => LSP.touchFile(file, true))
      })

      const status = Effect.fn("File.status")(function* () {
        if (Instance.project.vcs !== "git") return []

        return yield* Effect.promise(async () => {
          const diffOutput = (
            await git(["-c", "core.fsmonitor=false", "-c", "core.quotepath=false", "diff", "--numstat", "HEAD"], {
              cwd: Instance.directory,
            })
          ).text()

          const changed: File.Info[] = []

          if (diffOutput.trim()) {
            for (const line of diffOutput.trim().split("\n")) {
              const [added, removed, file] = line.split("\t")
              changed.push({
                path: file,
                added: added === "-" ? 0 : parseInt(added, 10),
                removed: removed === "-" ? 0 : parseInt(removed, 10),
                status: "modified",
              })
            }
          }

          const untrackedOutput = (
            await git(
              [
                "-c",
                "core.fsmonitor=false",
                "-c",
                "core.quotepath=false",
                "ls-files",
                "--others",
                "--exclude-standard",
              ],
              {
                cwd: Instance.directory,
              },
            )
          ).text()

          if (untrackedOutput.trim()) {
            for (const file of untrackedOutput.trim().split("\n")) {
              try {
                const content = await Filesystem.readText(path.join(Instance.directory, file))
                changed.push({
                  path: file,
                  added: content.split("\n").length,
                  removed: 0,
                  status: "added",
                })
              } catch {
                continue
              }
            }
          }

          const deletedOutput = (
            await git(
              [
                "-c",
                "core.fsmonitor=false",
                "-c",
                "core.quotepath=false",
                "diff",
                "--name-only",
                "--diff-filter=D",
                "HEAD",
              ],
              {
                cwd: Instance.directory,
              },
            )
          ).text()

          if (deletedOutput.trim()) {
            for (const file of deletedOutput.trim().split("\n")) {
              changed.push({
                path: file,
                added: 0,
                removed: 0,
                status: "deleted",
              })
            }
          }

          return changed.map((item) => {
            const full = path.isAbsolute(item.path) ? item.path : path.join(Instance.directory, item.path)
            return {
              ...item,
              path: path.relative(Instance.directory, full),
            }
          })
        })
      })

      const read = Effect.fn("File.read")(function* (file: string) {
        using _ = log.time("read", { file })
        const full = path.join(Instance.directory, file)

        if (!Instance.containsPath(full)) throw new Error("Access denied: path escapes project directory")

        if (isSheetByExtension(file)) {
          return {
            type: "binary" as const,
            content: "",
            mimeType: getMimeType(file) || "application/octet-stream",
          }
        }

        if (isImageByExtension(file)) {
          const exists = yield* appFs.existsSafe(full)
          if (exists) {
            const bytes = yield* appFs.readFile(full).pipe(Effect.catch(() => Effect.succeed(new Uint8Array())))
            return {
              type: "text" as const,
              content: Buffer.from(bytes).toString("base64"),
              mimeType: getImageMimeType(file),
              encoding: "base64" as const,
            }
          }
          return { type: "text" as const, content: "" }
        }

        if (isEncodedByExtension(file)) {
          const exists = yield* appFs.existsSafe(full)
          if (exists) {
            const bytes = yield* appFs.readFile(full).pipe(Effect.catch(() => Effect.succeed(new Uint8Array())))
            return {
              type: "text" as const,
              content: Buffer.from(bytes).toString("base64"),
              mimeType: getMimeType(file) || "application/octet-stream",
              encoding: "base64" as const,
            }
          }
          return { type: "text" as const, content: "" }
        }

        const knownText = isTextByExtension(file) || isTextByName(file)

        if (isBinaryByExtension(file) && !knownText) return { type: "binary" as const, content: "" }

        const exists = yield* appFs.existsSafe(full)
        if (!exists) return { type: "text" as const, content: "" }

        const mimeType = Filesystem.mimeType(full)
        const encode = knownText ? false : shouldEncode(mimeType)

        if (encode && !inline(mimeType)) return { type: "binary" as const, content: "", mimeType }

        if (encode) {
          const bytes = yield* appFs.readFile(full).pipe(Effect.catch(() => Effect.succeed(new Uint8Array())))
          return {
            type: "text" as const,
            content: Buffer.from(bytes).toString("base64"),
            mimeType,
            encoding: "base64" as const,
          }
        }

        const content = yield* appFs.readFileString(full).pipe(
          Effect.map((s) => s.trim()),
          Effect.catch(() => Effect.succeed("")),
        )

        if (Instance.project.vcs === "git") {
          return yield* Effect.promise(async (): Promise<File.Content> => {
            let diff = (
              await git(["-c", "core.fsmonitor=false", "diff", "--", file], { cwd: Instance.directory })
            ).text()
            if (!diff.trim()) {
              diff = (
                await git(["-c", "core.fsmonitor=false", "diff", "--staged", "--", file], {
                  cwd: Instance.directory,
                })
              ).text()
            }
            if (diff.trim()) {
              const original = (await git(["show", `HEAD:${file}`], { cwd: Instance.directory })).text()
              const patch = structuredPatch(file, file, original, content, "old", "new", {
                context: Infinity,
                ignoreWhitespace: true,
              })
              return { type: "text", content, patch, diff: formatPatch(patch) }
            }
            return { type: "text", content }
          })
        }

        return { type: "text" as const, content }
      })

      const write = Effect.fn("File.write")(function* (input: File.WriteInput) {
        using _ = log.time("write", { file: input.path })
        const full = path.join(Instance.directory, input.path)

        if (!Instance.containsPath(full)) throw new Error("Access denied: path escapes project directory")

        const exists = yield* appFs.existsSafe(full)
        if (input.encoding === "base64") {
          yield* Effect.promise(() => Filesystem.write(full, Buffer.from(input.content, "base64")))
          yield* emit(full, exists, false)
          return yield* read(input.path)
        }

        const knownText = isTextByExtension(input.path) || isTextByName(input.path)
        if (isImageByExtension(input.path)) throw new Error("Image files cannot be edited here")
        if (isBinaryByExtension(input.path) && !knownText) throw new Error("Binary files cannot be edited here")

        if (exists) {
          const mimeType = Filesystem.mimeType(full)
          const encode = knownText ? false : shouldEncode(mimeType)
          if (encode && !isImage(mimeType)) throw new Error("Binary files cannot be edited here")
        }

        yield* Effect.promise(() => Filesystem.write(full, input.content))

        if (input.encoding !== "base64" && /\.(md|mdx)$/i.test(input.path)) {
          yield* Effect.promise(async () => {
            await Trellis.init(Instance.directory).catch(() => undefined)
            if (!Trellis.storeStats(Instance.directory)) return
            SemanticLinks.syncMarkdownFile(input.path, input.content, Instance.directory, {
              actor: "file-write",
              actorKind: "system",
              source: "markdown",
              reason: "markdown semantic link sync",
              relatedEntities: [`file:${input.path.replaceAll("\\", "/").replace(/^\.\//, "")}`],
            })
          })
        }

        if (input.format) {
          yield* Effect.promise(() => Format.file(full))
        }

        yield* emit(full, exists, true)

        return yield* read(input.path)
      })

      const list = Effect.fn("File.list")(function* (dir?: string) {
        const exclude = [".git", ".DS_Store"]
        let ignored = (_: string) => false
        if (Instance.project.vcs === "git") {
          const ig = ignore()
          const gitignore = path.join(Instance.project.worktree, ".gitignore")
          const gitignoreText = yield* appFs.readFileString(gitignore).pipe(Effect.catch(() => Effect.succeed("")))
          if (gitignoreText) ig.add(gitignoreText)
          const ignoreFile = path.join(Instance.project.worktree, ".ignore")
          const ignoreText = yield* appFs.readFileString(ignoreFile).pipe(Effect.catch(() => Effect.succeed("")))
          if (ignoreText) ig.add(ignoreText)
          ignored = ig.ignores.bind(ig)
        }

        const resolved = dir ? path.join(Instance.directory, dir) : Instance.directory
        if (!Instance.containsPath(resolved)) throw new Error("Access denied: path escapes project directory")

        const entries = yield* appFs.readDirectoryEntries(resolved).pipe(Effect.orElseSucceed(() => []))

        const nodes: File.Node[] = []
        for (const entry of entries) {
          if (exclude.includes(entry.name)) continue
          const absolute = path.join(resolved, entry.name)
          const file = path.relative(Instance.directory, absolute)
          let type: Node["type"] = entry.type === "directory" ? "directory" : "file"
          if (entry.type === "symlink") {
            type = yield* Effect.promise(async () => {
              try {
                const stat = await fs.promises.stat(absolute)
                return stat.isDirectory() ? "directory" : "file"
              } catch {
                return "file"
              }
            })
          }
          nodes.push({
            name: entry.name,
            path: file,
            absolute,
            type,
            ignored: ignored(type === "directory" ? file + "/" : file),
          })
        }
        return nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      })

      const search = Effect.fn("File.search")(function* (input: {
        query: string
        limit?: number
        dirs?: boolean
        type?: "file" | "directory"
      }) {
        yield* ensure()
        const { cache } = yield* InstanceState.get(state)

        return yield* Effect.promise(async () => {
          const query = input.query.trim()
          const limit = input.limit ?? 100
          const kind = input.type ?? (input.dirs === false ? "file" : "all")
          log.info("search", { query, kind })

          const result = cache
          const preferHidden = query.startsWith(".") || query.includes("/.")

          if (!query) {
            if (kind === "file") return result.files.slice(0, limit)
            return sortHiddenLast(result.dirs.toSorted(), preferHidden).slice(0, limit)
          }

          const items =
            kind === "file" ? result.files : kind === "directory" ? result.dirs : [...result.files, ...result.dirs]

          const searchLimit = kind === "directory" && !preferHidden ? limit * 20 : limit
          const segmented = searchByPathSegments(items, query, searchLimit)
          const sorted =
            segmented ?? fuzzysort.go(query, items, { limit: searchLimit }).map((item) => item.target)
          const output = kind === "directory" ? sortHiddenLast(sorted, preferHidden).slice(0, limit) : sorted

          log.info("search", { query, kind, results: output.length })
          return output
        })
      })

      log.info("init")
      return Service.of({ init, status, read, write, list, search })
    }),
  )

  export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export function init() {
    return runPromise((svc) => svc.init())
  }

  export async function status() {
    return runPromise((svc) => svc.status())
  }

  export async function read(file: string) {
    return runPromise((s) => s.read(file))
  }

  export async function write(input: File.WriteInput) {
    return runPromise((s) => s.write(input))
  }

  export async function list(dir?: string) {
    return runPromise((s) => s.list(dir))
  }

  export async function search(input: { query: string; limit?: number; dirs?: boolean; type?: "file" | "directory" }) {
    return runPromise((svc) => svc.search(input))
  }
}
