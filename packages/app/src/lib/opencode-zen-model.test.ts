import { describe, expect, test } from "bun:test"

import {
  HOSTED_CLOUD_DEFAULT_MODEL_ID,
  HOSTED_FREE_MODEL_ID,
  hostedFreeModelKey,
  hostedZenFallbackModelKey,
  OPENCODE_PROVIDER_ID,
  TRELLIS_CLOUD_DEFAULT_MODEL_ID,
  TRELLIS_CLOUD_PROVIDER_ID,
} from "./opencode-zen-model"

describe("opencode-zen-model", () => {
  test("hostedFreeModelKey points at OpenCode Zen minimax default", () => {
    expect(hostedFreeModelKey()).toEqual({
      providerID: OPENCODE_PROVIDER_ID,
      modelID: HOSTED_CLOUD_DEFAULT_MODEL_ID,
    })
    expect(HOSTED_CLOUD_DEFAULT_MODEL_ID).toBe("minimax-m3-free")
    expect(TRELLIS_CLOUD_DEFAULT_MODEL_ID).toBe("gemini-flash-lite-latest")
  })

  test("hostedZenFallbackModelKey points at OpenCode Zen nemotron", () => {
    expect(hostedZenFallbackModelKey()).toEqual({
      providerID: OPENCODE_PROVIDER_ID,
      modelID: HOSTED_FREE_MODEL_ID,
    })
    expect(HOSTED_FREE_MODEL_ID).toBe("nemotron-3-super-free")
  })
})
