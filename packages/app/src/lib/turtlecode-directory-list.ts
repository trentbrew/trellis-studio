import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import fuzzysort from "fuzzysort"

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

export function trimTrailingDirectory(input: string) {
  const v = normalizeDriveRoot(input)
  if (v === "/") return v
  if (v === "//") return v
  if (/^[A-Za-z]:\/$/.test(v)) return v
  return v.replace(/\/+$/, "")
}

function cleanInput(value: string) {
  const first = (value ?? "").split(/\r?\n/)[0] ?? ""
  return first.replace(/[\u0000-\u001F\u007F]/g, "").trim()
}

const dirCache = new Map<string, Promise<Array<{ name: string; absolute: string }>>>()

export function turtlecodeDirCacheHas(dir: string) {
  return dirCache.has(trimTrailingDirectory(dir))
}

async function listDirectories(sdk: OpencodeClient, dir: string) {
  const key = trimTrailingDirectory(dir)
  const existing = dirCache.get(key)
  if (existing) return existing

  const request = sdk.file
    .list({ directory: key, path: "" })
    .then((x) => x.data ?? [])
    .catch(() => [])
    .then((nodes) =>
      nodes
        .filter((n) => n.type === "directory")
        .map((n) => ({
          name: n.name,
          absolute: trimTrailingDirectory(normalizeDriveRoot(n.absolute)),
        })),
    )

  dirCache.set(key, request)
  return request
}

export function prefetchTurtlecodeListing(sdk: OpencodeClient, home: string) {
  const base = trimTrailingDirectory(`${home}/.turtlecode`)
  if (!base || base === "/.turtlecode") return
  void listDirectories(sdk, base)
}

export function createDirectorySearch(sdk: OpencodeClient, start: () => string | undefined) {
  let current = 0

  const match = async (dir: string, query: string, limit: number) => {
    const items = await listDirectories(sdk, dir)
    if (!query) return items.slice(0, limit).map((x) => x.absolute)
    return fuzzysort.go(query, items, { key: "name", limit }).map((x) => x.obj.absolute)
  }

  return async (filter: string) => {
    const token = ++current
    const active = () => token === current

    const value = cleanInput(filter)
    const base = trimTrailingDirectory(start() ?? "")
    if (!base) return [] as string[]

    const raw = normalizeDriveRoot(value)
    const query = raw.startsWith("~/") ? raw.slice(2) : raw.replace(/^\/+/, "")
    const out = await match(base, query.split("/")[0] ?? "", 50)
    if (!active()) return []
    return Array.from(new Set(out)).slice(0, 50)
  }
}
