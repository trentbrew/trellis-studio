/** Client-side slug shape (matches studio/packages/docs/plans/slug-policy.md). */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/

export type SlugValidation =
  | { ok: true }
  | { ok: false; reason: "empty" | "short" | "long" | "invalid" | "hyphen" | "digits" }

export function validatePublishSlug(slug: string): SlugValidation {
  const s = slug.trim()
  if (!s) return { ok: false, reason: "empty" }
  if (s.length < 3) return { ok: false, reason: "short" }
  if (s.length > 63) return { ok: false, reason: "long" }
  if (!/[a-z]/.test(s)) return { ok: false, reason: "digits" }
  if (s.startsWith("-") || s.endsWith("-")) return { ok: false, reason: "hyphen" }
  if (!SLUG_RE.test(s)) return { ok: false, reason: "invalid" }
  return { ok: true }
}

/** Suggest the next slug when `base` is taken (e.g. `game` → `game-2`). */
export function suggestNextSlug(base: string, attempt = 2): string {
  const suffix = `-${attempt}`
  const maxBase = Math.max(1, 63 - suffix.length)
  const trimmed = base.slice(0, maxBase).replace(/-+$/, "")
  const candidate = `${trimmed}${suffix}`
  const valid = validatePublishSlug(candidate)
  if (valid.ok) return candidate
  if (attempt > 20) return candidate
  return suggestNextSlug(base, attempt + 1)
}

/** Suggest a slug from a project or directory name. */
export function slugifyPublishName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!s) s = "site"
  if (!/[a-z]/.test(s)) s = `p-${s}`
  if (s.length < 3) s = `${s}app`.slice(0, 63)
  return s.slice(0, 63).replace(/^-+|-+$/g, "") || "site"
}
