import type { ModelKey } from "@/context/models"

/** Trellis Cloud metered provider (Gemini via broker ai-proxy). */
export const TRELLIS_CLOUD_PROVIDER_ID = "trellis-cloud"
export const TRELLIS_CLOUD_DEFAULT_MODEL_ID = "gemini-flash-lite-latest"

/** OpenCode Zen free models (opencode.ai/zen). */
export const OPENCODE_PROVIDER_ID = "opencode"
export const HOSTED_FREE_MODEL_ID = "nemotron-3-super-free"
/** Temporary hosted default while Vercel AI Gateway / trellis-cloud path is stabilized. */
export const HOSTED_CLOUD_DEFAULT_MODEL_ID = "minimax-m3-free"

export function hostedFreeModelKey(): ModelKey {
  return { providerID: OPENCODE_PROVIDER_ID, modelID: HOSTED_CLOUD_DEFAULT_MODEL_ID }
}

export function hostedZenFallbackModelKey(): ModelKey {
  return { providerID: OPENCODE_PROVIDER_ID, modelID: HOSTED_FREE_MODEL_ID }
}
