import {
  ACCEPTED_AUDIO_TYPES,
  ACCEPTED_FILE_TYPES,
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
} from "@/constants/file-picker"

export { ACCEPTED_FILE_TYPES }

const IMAGE_MIMES = new Set(ACCEPTED_IMAGE_TYPES)
const AUDIO_MIMES = new Set(ACCEPTED_AUDIO_TYPES)
const VIDEO_MIMES = new Set(ACCEPTED_VIDEO_TYPES)
const IMAGE_EXTS = new Map([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
])
const AUDIO_EXTS = new Map([
  ["aac", "audio/aac"],
  ["aif", "audio/aiff"],
  ["aiff", "audio/aiff"],
  ["flac", "audio/flac"],
  ["m4a", "audio/mp4"],
  ["mid", "audio/midi"],
  ["midi", "audio/midi"],
  ["mp3", "audio/mpeg"],
  ["oga", "audio/ogg"],
  ["ogg", "audio/ogg"],
  ["opus", "audio/opus"],
  ["wav", "audio/wav"],
  ["weba", "audio/webm"],
])
const VIDEO_EXTS = new Map([
  ["3g2", "video/3gpp2"],
  ["3gp", "video/3gpp"],
  ["avi", "video/x-msvideo"],
  ["flv", "video/x-flv"],
  ["m4v", "video/mp4"],
  ["mkv", "video/x-matroska"],
  ["mov", "video/quicktime"],
  ["mp4", "video/mp4"],
  ["ogv", "video/ogg"],
  ["webm", "video/webm"],
  ["wmv", "video/x-ms-wmv"],
])
const TEXT_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
])

const DOCUMENT_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
])

const DOCUMENT_EXTS: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
}

const SAMPLE = 4096

function kind(type: string) {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function ext(name: string) {
  const idx = name.lastIndexOf(".")
  if (idx === -1) return ""
  return name.slice(idx + 1).toLowerCase()
}

export function referenceMime(name: string) {
  const suffix = ext(name)
  const media = IMAGE_EXTS.get(suffix) ?? AUDIO_EXTS.get(suffix) ?? VIDEO_EXTS.get(suffix)
  if (media) return media
  if (suffix === "pdf") return "application/pdf"
  const doc = DOCUMENT_EXTS[suffix]
  if (doc) return doc
  return "text/plain"
}

function textMime(type: string) {
  if (!type) return false
  if (type.startsWith("text/")) return true
  if (TEXT_MIMES.has(type)) return true
  if (type.endsWith("+json")) return true
  return type.endsWith("+xml")
}

function textBytes(bytes: Uint8Array) {
  if (bytes.length === 0) return true
  let count = 0
  for (const byte of bytes) {
    if (byte === 0) return false
    if (byte < 9 || (byte > 13 && byte < 32)) count += 1
  }
  return count / bytes.length <= 0.3
}

export async function attachmentMime(file: File) {
  const type = kind(file.type)
  const suffix = ext(file.name)
  if (IMAGE_MIMES.has(type)) return type
  if (AUDIO_MIMES.has(type)) return type
  if (VIDEO_MIMES.has(type)) return type
  if (type.startsWith("audio/")) {
    const audio = AUDIO_EXTS.get(suffix)
    if (audio) return audio
  }
  if (type.startsWith("video/")) {
    const video = VIDEO_EXTS.get(suffix)
    if (video) return video
  }
  if (type === "application/pdf") return type
  if (DOCUMENT_MIMES.has(type)) return type

  const fallback =
    IMAGE_EXTS.get(suffix) ??
    AUDIO_EXTS.get(suffix) ??
    VIDEO_EXTS.get(suffix) ??
    (suffix === "pdf" ? "application/pdf" : undefined) ??
    DOCUMENT_EXTS[suffix]
  if ((!type || type === "application/octet-stream") && fallback) return fallback

  if (textMime(type)) return "text/plain"
  const bytes = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer())
  if (!textBytes(bytes)) return
  return "text/plain"
}
