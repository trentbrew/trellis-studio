import { entityShellClass } from "@/lib/entity-shell"

const PREFIX = "entity://"

export function entityTab(id: string): string {
  return `${PREFIX}${encodeURIComponent(id.trim())}`
}

export function idFromEntityTab(tab: string): string | undefined {
  if (!tab.startsWith(PREFIX)) return undefined
  const raw = tab.slice(PREFIX.length)
  if (!raw) return undefined
  return decodeURIComponent(raw)
}

export function isEntityTab(tab: string): boolean {
  return tab.startsWith(PREFIX)
}

export function typeFromEntityId(id: string): string {
  if (!id.includes(":")) return "entity"
  return id.split(":")[0] || "entity"
}

/** Document + container shells open as session tabs; actor + temporal stay dialogs.
 * Notes keep the dialog (special NoteEditor surface) until a tab host exists. */
export function shellOpensAsTab(type: string | undefined): boolean {
  const key = (type ?? "").toLowerCase()
  if (key === "note") return false
  const shell = entityShellClass(type)
  return shell === "document" || shell === "container"
}
