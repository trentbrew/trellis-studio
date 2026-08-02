const issue = /^TRL-\d+$/i
const entity = /^[a-z][a-z0-9_-]*:.+$/i

export const ENTITY_LINK = "entity-link"

export function isEntityRef(text: string) {
  const value = text.trim()
  if (!value) return false
  if (issue.test(value)) return true
  return entity.test(value)
}

export function entityHref(id: string) {
  return `entity://${encodeURIComponent(id.trim())}`
}

export function entityFromHref(href: string) {
  if (!href.startsWith("entity://")) return undefined
  try {
    return decodeURIComponent(href.slice("entity://".length))
  } catch {
    return undefined
  }
}
