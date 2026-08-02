#!/usr/bin/env bun
/**
 * Tiptap Convert API export script.
 *
 * Reads a Tiptap JSON document + credentials, POSTs to the PDF export endpoint,
 * writes the resulting PDF to disk, and prints a diagnostic summary.
 *
 * Usage:
 *   bun --env-file=.env.tiptap-convert script/tiptap-convert/export.ts \
 *     --input script/tiptap-convert/phase1-stress.json \
 *     --output script/tiptap-convert/.output/phase1-stress.pdf
 *
 * Flags:
 *   --input <path>   Input JSON file containing a Tiptap doc (required).
 *   --output <path>  Destination PDF path (default: alongside input with .pdf).
 *   --dry-run        Validate env + input, print request body, do not call API.
 *
 * Env vars (from .env.tiptap-convert):
 *   TIPTAP_CONVERT_APP_ID   X-App-Id header value.
 *   TIPTAP_CONVERT_JWT      Bearer token for Authorization header.
 *   TIPTAP_CONVERT_URL      Optional override (default https://api.tiptap.dev).
 */

import { resolve, dirname, basename } from "node:path"
import { mkdir } from "node:fs/promises"

const args = parse(Bun.argv.slice(2))
const input = args.input ?? ""
const output = args.output ?? (input ? input.replace(/\.json$/i, ".pdf") : "")
const dry = args["dry-run"] === true

if (!input) {
  err("missing --input <path> to a Tiptap JSON document")
  process.exit(2)
}

const inPath = resolve(input)
const outPath = resolve(output)

const file = Bun.file(inPath)
if (!(await file.exists())) {
  err(`input not found: ${inPath}`)
  process.exit(2)
}

const raw = await file.text()
let doc: unknown
try {
  doc = JSON.parse(raw)
} catch (e) {
  err(`invalid JSON in ${inPath}: ${(e as Error).message}`)
  process.exit(2)
}

if (!doc || typeof doc !== "object" || (doc as any).type !== "doc") {
  err(`expected a Tiptap doc (top-level {\"type\":\"doc\",\"content\":[...]})`)
  process.exit(2)
}

const appId = process.env.TIPTAP_CONVERT_APP_ID ?? ""
const jwt = process.env.TIPTAP_CONVERT_JWT ?? ""
const base = process.env.TIPTAP_CONVERT_URL ?? "https://api.tiptap.dev"

if (!dry) {
  if (!appId) {
    err("missing env TIPTAP_CONVERT_APP_ID (put it in .env.tiptap-convert and run with --env-file=.env.tiptap-convert)")
    process.exit(2)
  }
  if (!jwt) {
    err("missing env TIPTAP_CONVERT_JWT (put it in .env.tiptap-convert and run with --env-file=.env.tiptap-convert)")
    process.exit(2)
  }
}

const body = {
  doc: JSON.stringify(doc),
  pageSize: { width: "210mm", height: "297mm" },
  pageMargins: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
}

log(`input:   ${inPath}`)
log(`output:  ${outPath}`)
log(`size:    ${byteFmt(raw.length)} json (${count(doc)} nodes)`)
log(`api:     ${base}/v2/convert/export/pdf`)
log(`app-id:  ${mask(appId)}`)
log(`jwt:     ${mask(jwt)}`)

if (dry) {
  log("")
  log("--dry-run enabled; skipping API call.")
  log("request body preview (first 400 chars of body.doc):")
  log(body.doc.slice(0, 400) + (body.doc.length > 400 ? "…" : ""))
  process.exit(0)
}

const url = `${base.replace(/\/$/, "")}/v2/convert/export/pdf`
const started = Date.now()
log("")
log("POST /v2/convert/export/pdf …")

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${jwt}`,
    "X-App-Id": appId,
    "Content-Type": "application/json",
    "Accept": "application/pdf",
  },
  body: JSON.stringify(body),
})

const elapsed = Date.now() - started
log(`status:  ${res.status} ${res.statusText} (${elapsed}ms)`)
const contentType = res.headers.get("content-type") ?? ""
log(`type:    ${contentType}`)
const disposition = res.headers.get("content-disposition")
if (disposition) log(`disp:    ${disposition}`)

if (!res.ok) {
  const text = await res.text().catch(() => "")
  err("")
  err("request failed")
  err(text.slice(0, 2000))
  process.exit(1)
}

if (!contentType.includes("application/pdf")) {
  const text = await res.text().catch(() => "")
  err("")
  err(`expected application/pdf, got ${contentType || "(empty)"}`)
  err(text.slice(0, 2000))
  process.exit(1)
}

const buf = new Uint8Array(await res.arrayBuffer())
await mkdir(dirname(outPath), { recursive: true })
await Bun.write(outPath, buf)

log("")
log(`ok: wrote ${byteFmt(buf.length)} → ${outPath}`)
log(`open with: open "${outPath}"`)

// ────────────────────────────────────────────────────────────────────────────

function parse(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

function count(doc: unknown): number {
  let n = 0
  const walk = (x: any) => {
    if (!x) return
    if (typeof x !== "object") return
    if (x.type) n++
    if (Array.isArray(x.content)) for (const child of x.content) walk(child)
  }
  walk(doc)
  return n
}

function byteFmt(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function mask(s: string): string {
  if (!s) return "(unset)"
  if (s.length <= 8) return "***"
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`
}

function log(msg: string): void {
  console.log(msg)
}

function err(msg: string): void {
  console.error(msg)
}
