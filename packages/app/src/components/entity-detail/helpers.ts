import { entityTypeFromId } from "@/lib/entity-theme"

export const OMIT_FACT_KEYS = new Set([
  "title",
  "name",
  "message",
  "body",
  "description",
  "purpose",
  "summary",
  "type",
  "kind",
])

export function show(v: unknown): string {
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  const text = JSON.stringify(v, null, 2)
  return text ?? ""
}

export function leaf(path: string): string {
  return path.split("/").pop() || path
}

export function short(id: string): string {
  if (!id.includes(":")) return id
  return id.split(":").slice(1).join(":")
}

export function ago(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export function isMd(path: string): boolean {
  return /\.(md|markdown|mdx|note)$/i.test(path)
}

export function isCsv(path: string): boolean {
  return /\.csv$/i.test(path)
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|apng|jxl)$/i
const AUDIO_RE = /\.(mp3|wav|ogg|oga|opus|flac|aac|m4a|weba|wma|aif|aiff|mid|midi)$/i
const VIDEO_RE = /\.(mp4|m4v|webm|ogv|mov|mkv|avi|flv|wmv|3gp|3g2)$/i

export function isImage(path: string): boolean {
  return IMAGE_RE.test(path)
}

export function isVideo(path: string): boolean {
  return VIDEO_RE.test(path)
}

export function isAudio(path: string): boolean {
  return AUDIO_RE.test(path)
}

export function ext(path: string): string {
  const dot = path.lastIndexOf(".")
  if (dot < 0) return ""
  return path.slice(dot + 1).toLowerCase()
}

export function isFileEntity(type: string | undefined): boolean {
  return type === "file" || type === "directory"
}

export function pathFromId(id: string): string {
  return short(id)
}

export function typeFromId(id: string): string {
  return entityTypeFromId(id, "entity")
}

export function rawUrl(base: string, dir: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/file/raw?directory=${encodeURIComponent(dir)}&path=${encodeURIComponent(path)}`
}
