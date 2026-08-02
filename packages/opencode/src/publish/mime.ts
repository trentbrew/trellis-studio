// Sandbox-side MIME map. Independent of the router's mime.ts because they
// serve different purposes — this one stamps Content-Type into the manifest
// before upload; the router's is a fallback when R2 metadata is missing.

const MAP: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  wasm: "application/wasm",
  map: "application/json",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
}

export function contentTypeFor(relativePath: string): string {
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? ""
  return MAP[ext] ?? "application/octet-stream"
}
