import { GENERATED_ICONS } from "./generated-icons"
import { parseIconKey, type IconLibrary } from "./icon-key"

const CUSTOM_KEYS = new Set(Object.keys(GENERATED_ICONS))

export function isCustomIconKey(value: string): boolean {
  const parsed = parseIconKey(value)
  if (!parsed) return false
  if (parsed.library === "custom") return true
  if (parsed.library === "lucide" && !value.includes(":")) {
    return CUSTOM_KEYS.has(parsed.key)
  }
  return false
}

export function resolveIconLibrary(value: string): IconLibrary {
  const parsed = parseIconKey(value)
  if (!parsed) return "lucide"
  if (parsed.library !== "lucide") return parsed.library
  if (isCustomIconKey(value)) return "custom"
  return "lucide"
}
