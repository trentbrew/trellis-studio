import YAML from "yaml"

export type Frontmatter = {
  meta: Record<string, unknown>
  body: string
}

const fence = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/

/** Characters that almost never appear in real frontmatter keys but show up
 *  when markdown content (emphasis, headings, links, code, tables) is
 *  accidentally parsed as YAML. */
const SUSPICIOUS_KEY_CHARS = /[*#>[\]()|`!]/
const ORDERED_LIST_KEY = /^\d+\.\s/

function isObsidianStyleMeta(meta: unknown): meta is Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false

  for (const key of Object.keys(meta)) {
    // Empty keys or keys with newlines are not valid frontmatter keys
    if (!key || key.includes("\n") || key.includes("\r")) return false
    // Reject keys that look like they contain markdown syntax
    if (SUSPICIOUS_KEY_CHARS.test(key)) return false
    // Reject keys that look like ordered list items (e.g. "1. Something")
    if (ORDERED_LIST_KEY.test(key)) return false
  }

  return true
}

/** The first non-empty line inside the fence must look like a YAML key.
 *  This prevents matching `---` horizontal rules whose content is normal
 *  markdown paragraphs, headings, or lists that YAML happens to coerce
 *  into an object. */
function isObsidianStyleYamlText(yamlText: string): boolean {
  for (const line of yamlText.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Accept unquoted key: value (the 99% case in Obsidian)
    return /^[\w-]+:/.test(trimmed)
  }
  return false
}

export function parse(text: string): Frontmatter | undefined {
  const match = text.match(fence)
  if (!match) return undefined
  try {
    const yamlText = match[1]
    if (!isObsidianStyleYamlText(yamlText)) return undefined

    const raw = YAML.parse(yamlText, { logLevel: "silent" })
    if (!isObsidianStyleMeta(raw)) return undefined
    return {
      meta: raw as Record<string, unknown>,
      body: text.slice(match[0].length),
    }
  } catch {
    return undefined
  }
}

export function renderHtml(meta: Record<string, unknown>): string {
  const title = typeof meta.title === "string" ? meta.title : undefined
  const desc = typeof meta.description === "string" ? meta.description : undefined
  const rows = Object.entries(meta)
    .filter(([key]) => key !== "title" && key !== "description")
    .map(([key, val]) => {
      const rendered = Array.isArray(val)
        ? val.map((v) => `<span data-slot="frontmatter-tag">${esc(String(v))}</span>`).join("")
        : `<span data-slot="frontmatter-value">${esc(String(val))}</span>`
      return `<div class="fm-field"><span class="fm-field-key">${esc(key)}</span><div class="fm-field-val">${rendered}</div></div>`
    })
    .join("")

  const header =
    title !== undefined || desc !== undefined
      ? `<div data-slot="fm-header">${title !== undefined ? `<div data-slot="fm-title">${esc(title)}</div>` : ""}${desc !== undefined ? `<div data-slot="fm-desc">${esc(desc)}</div>` : ""}</div>`
      : ""

  return `<details data-component="frontmatter" open><summary data-slot="frontmatter-toggle">Frontmatter</summary><div data-slot="fm-body">${header}<div data-slot="fm-grid">${rows}</div></div></details>`
}

function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
