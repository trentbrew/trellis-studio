export type IconLibrary = "lucide" | "custom" | "brand"

export type ParsedIconKey = {
  library: IconLibrary
  /** Storage key without library prefix */
  key: string
  /** Value as stored / selected */
  raw: string
}

export function formatIconKey(library: IconLibrary, key: string): string {
  if (library === "lucide") return key
  return `${library}:${key}`
}

export function parseIconKey(value: string | undefined | null): ParsedIconKey | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("custom:")) {
    return { library: "custom", key: trimmed.slice("custom:".length), raw: trimmed }
  }
  if (trimmed.startsWith("brand:")) {
    return { library: "brand", key: trimmed.slice("brand:".length), raw: trimmed }
  }
  if (trimmed.startsWith("lucide:")) {
    return { library: "lucide", key: trimmed.slice("lucide:".length), raw: trimmed }
  }

  return { library: "lucide", key: trimmed, raw: trimmed }
}

export function iconDisplayLabel(value: string): string {
  const parsed = parseIconKey(value)
  if (!parsed) return value
  if (parsed.library === "lucide") return parsed.key
  return `${parsed.library}:${parsed.key}`
}

export function iconsMatch(stored: string, candidate: string): boolean {
  if (stored === candidate) return true
  const a = parseIconKey(stored)
  const b = parseIconKey(candidate)
  if (!a || !b) return false
  return a.library === b.library && a.key === b.key
}
