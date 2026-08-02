/**
 * Lightweight, regex-based import scanner used to derive "imports" edges for
 * the Trellis graph. Designed to be fast enough to run over thousands of files
 * on every graph request, backed by a contentHash-keyed cache so stable files
 * are parsed only once per process.
 *
 * Scope of what we detect (intentionally minimal, pragmatic):
 *   - JS/TS: `import ... from "x"`, `import "x"`, `import("x")`, `require("x")`,
 *            `export ... from "x"`
 *   - CSS:   `@import "x"`, `@import url(x)`
 *   - HTML:  `<link href="x">`, `<script src="x">`, `<img src="x">`
 *   - Svelte/Vue/Astro: same as JS (script section) via the same regex.
 *
 * This is *not* a full resolver — bare specifiers (`react`, `@scope/pkg`) are
 * ignored. Only relative and workspace-absolute paths are resolved against the
 * set of tracked files.
 */

const MAX_BYTES = 512 * 1024 // skip content larger than 512KB

const SCAN_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "htm",
  "svelte",
  "vue",
  "astro",
  "md",
  "mdx",
])

const RESOLVE_EXT = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "css", "scss", "sass", "less", "json"]
const INDEX_NAMES = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"]

// Import statements — capture group 1 is the specifier.
// Uses non-greedy matching and handles both double- and single-quotes.
const RE_IMPORT_FROM = /(?:^|[\s;])import\s+(?:[^"'`]+?\s+from\s+)?["']([^"'`\n]+)["']/g
const RE_DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"'`\n]+)["']\s*\)/g
const RE_REQUIRE = /\brequire\s*\(\s*["']([^"'`\n]+)["']\s*\)/g
const RE_EXPORT_FROM = /(?:^|[\s;])export\s+[^;]*?\s+from\s+["']([^"'`\n]+)["']/g
const RE_CSS_IMPORT = /@import\s+(?:url\(\s*)?["']?([^"'`\n)]+)["']?\s*\)?/g
const RE_HTML_SRC = /<(?:script|img|source|iframe)\b[^>]*?\s(?:src)\s*=\s*["']([^"'`\n]+)["']/gi
const RE_HTML_LINK = /<link\b[^>]*?\s(?:href)\s*=\s*["']([^"'`\n]+)["']/gi
const RE_MD_LINK = /]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
// Wiki-style links: [[filename]], [[filename|alias]], [[filename#heading]]
const RE_WIKI_LINK = /\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g

const cache = new Map<string, string[]>()

function ext(path: string): string {
  const dot = path.lastIndexOf(".")
  if (dot < 0) return ""
  return path.slice(dot + 1).toLowerCase()
}

export function shouldScan(path: string): boolean {
  return SCAN_EXT.has(ext(path))
}

/** Extract raw import specifiers from file content. Returns de-duped list. */
export function extract(path: string, content: string): string[] {
  if (content.length > MAX_BYTES) return []
  const specs = new Set<string>()
  const e = ext(path)

  const add = (re: RegExp) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const s = m[1]?.trim()
      if (s) specs.add(s)
    }
  }

  if (
    e === "ts" ||
    e === "tsx" ||
    e === "js" ||
    e === "jsx" ||
    e === "mjs" ||
    e === "cjs" ||
    e === "mts" ||
    e === "cts" ||
    e === "svelte" ||
    e === "vue" ||
    e === "astro"
  ) {
    add(RE_IMPORT_FROM)
    add(RE_DYNAMIC_IMPORT)
    add(RE_REQUIRE)
    add(RE_EXPORT_FROM)
  }
  if (e === "css" || e === "scss" || e === "sass" || e === "less") {
    add(RE_CSS_IMPORT)
  }
  if (e === "html" || e === "htm" || e === "svelte" || e === "vue" || e === "astro") {
    add(RE_HTML_SRC)
    add(RE_HTML_LINK)
  }
  if (e === "md" || e === "mdx") {
    add(RE_MD_LINK)
    add(RE_WIKI_LINK)
  }

  return [...specs]
}

/** Extract + cache by content hash. Safe to call repeatedly. */
export function extractCached(path: string, content: string, hash?: string): string[] {
  const key = hash ? `${ext(path)}:${hash}` : null
  if (key) {
    const hit = cache.get(key)
    if (hit) return hit
  }
  const out = extract(path, content)
  if (key) cache.set(key, out)
  return out
}

/** Cache lookup only — returns undefined if no cached result exists. */
export function peekCache(path: string, hash?: string): string[] | undefined {
  if (!hash) return undefined
  return cache.get(`${ext(path)}:${hash}`)
}

function normalize(p: string): string {
  return p.replaceAll("\\", "/").replace(/\/+/g, "/")
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/")
  if (i < 0) return ""
  return p.slice(0, i)
}

/**
 * Resolve a raw import specifier against a set of tracked files. Returns the
 * resolved tracked-file path, or null if this is a bare/npm/external spec.
 */
export function resolve(fromPath: string, spec: string, tracked: Set<string>): string | null {
  // Strip query + hash (CSS/url specs often have these)
  let s = spec.split("#")[0]?.split("?")[0]?.trim()
  if (!s) return null
  // Remote URL / data URL / protocol-relative → skip
  if (/^(?:[a-z]+:|\/\/)/i.test(s)) return null
  // Windows-style backslashes
  s = normalize(s)

  const candidates: string[] = []
  if (s.startsWith("./") || s.startsWith("../")) {
    // Relative to file dir
    const base = dirname(normalize(fromPath))
    const joined = joinPath(base, s)
    candidates.push(joined)
  } else if (s.startsWith("/")) {
    // Workspace-absolute
    candidates.push(s.replace(/^\/+/, ""))
  } else {
    const fromExt = ext(fromPath)
    if (fromExt === "md" || fromExt === "mdx") {
      // Bare filename from a markdown/wiki link — resolve by basename across tracked files.
      // Prefer shortest path (most specific) to avoid ambiguous matches.
      const stem = s.includes(".") ? s : null
      let best: string | null = null
      for (const t of tracked) {
        const base = t.split("/").pop() ?? ""
        if (base === s || base === `${s}.md` || base === `${s}.mdx` || (stem && base === stem)) {
          if (!best || t.length < best.length) best = t
        }
      }
      return best
    }
    // Bare specifier (npm package, alias, etc.) — skip.
    return null
  }

  for (const c of candidates) {
    // Direct hit
    if (tracked.has(c)) return c
    // Try adding extensions
    for (const x of RESOLVE_EXT) {
      const withExt = `${c}.${x}`
      if (tracked.has(withExt)) return withExt
    }
    // Try index files within the path-as-directory
    for (const idx of INDEX_NAMES) {
      const withIdx = c ? `${c}/${idx}` : idx
      if (tracked.has(withIdx)) return withIdx
    }
  }
  return null
}

function joinPath(base: string, rel: string): string {
  const out = base ? base.split("/") : []
  for (const part of rel.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join("/")
}
