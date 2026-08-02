import type { ModelKey } from "@/context/models"

export const OPENAI_PROVIDER_ID = "openai"

/** Preferred Codex models when ChatGPT Pro/Plus OAuth is connected. */
export const CODEX_PREFERRED_MODEL_IDS = [
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
] as const

/** Non-Codex models still exposed after Codex OAuth model filtering. */
const OPENAI_OAUTH_ALLOWED = new Set(["gpt-5.2", "gpt-5.4", "gpt-5.4-mini"])

export function pickPreferredCodexModel(modelIds: Iterable<string>): string | undefined {
  const set = new Set(modelIds)
  for (const id of CODEX_PREFERRED_MODEL_IDS) {
    if (set.has(id)) return id
  }
  for (const id of set) {
    if (id.includes("codex") && !id.endsWith("-spark")) return id
  }
}

export function isOpenaiCodexSubscription(models: Record<string, unknown>): boolean {
  const ids = Object.keys(models)
  if (!ids.some((id) => id.includes("codex"))) return false
  return ids.every((id) => id.includes("codex") || OPENAI_OAUTH_ALLOWED.has(id))
}

export function preferredCodexModelKey(models: Record<string, unknown>): ModelKey | undefined {
  const modelID = pickPreferredCodexModel(Object.keys(models))
  if (!modelID) return
  return { providerID: OPENAI_PROVIDER_ID, modelID }
}
